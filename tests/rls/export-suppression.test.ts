import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asUser, asUserPersistant, creerCompte } from '@job-seeker/testing'

/**
 * JOB-058 / JOB-059 — emporter ses données, ou les effacer.
 *
 * Les deux fonctions s'exécutent avec les droits de l'APPELANT. Une
 * `security definer` ici serait un contournement de toute la RLS posée
 * jusqu'ici, offert sous couvert d'un droit de la personne — et le premier
 * export du profil d'autrui ne se remarquerait pas.
 */

let c: pg.Client
let alice: string
let bob: string
let profilAlice: string

const nettoyer = async (): Promise<void> => {
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@export.test'")
}

beforeAll(async () => {
  c = await admin()
  await nettoyer()
  alice = await creerCompte(c, 'alice@export.test')
  bob = await creerCompte(c, 'bob@export.test')
  profilAlice = (await c.query<{ id: string }>(
    'select id from public.profiles where user_id = $1', [alice],
  )).rows[0]!.id
  await c.query(
    `insert into public.experiences (profile_id, employeur, intitule, debut)
     values ($1, 'Wave Sénégal', 'Responsable acquisition', '2021-01-01')`, [profilAlice],
  )
  await c.query(
    `insert into public.recus (profile_id, canal, cv_texte, cran_au_moment, resultat)
     values ($1, 'email', 'CV envoyé le 26', 'agir-seul', 'accepte')`, [profilAlice],
  )
}, 40_000)

afterAll(async () => {
  await nettoyer()
  await c.end()
})

describe('export — complet, et lisible par une machine', () => {
  it('rend le profil et son parcours', async () => {
    const { rows } = await asUser(c, alice, (x) =>
      x.query<{ e: Record<string, unknown> }>('select public.exporter_mes_donnees() as e'),
    )
    const e = rows[0]!.e
    expect(e['format']).toBe('job-seeker/export/1')
    expect((e['experiences'] as unknown[])).toHaveLength(1)
    expect(JSON.stringify(e['experiences'])).toContain('Wave Sénégal')
  })

  it('rend les REÇUS — c’est ce qui compte le plus', async () => {
    // Ils sont la preuve de ce qui est parti au nom de la personne. Un export
    // qui les omettrait rendrait tout sauf ce qui compte.
    const { rows } = await asUser(c, alice, (x) =>
      x.query<{ e: Record<string, unknown> }>('select public.exporter_mes_donnees() as e'),
    )
    expect(JSON.stringify(rows[0]!.e['recus'])).toContain('CV envoyé le 26')
  })

  it('rend son propre journal d’accès — support compris', async () => {
    await c.query(
      `insert into audit.acces (acteur, action, objet_table, profile_id, detail)
       values ('support', 'lecture-dossier', 'recus', $1, '{"motif":"T-1"}'::jsonb)`, [profilAlice],
    )
    const { rows } = await asUser(c, alice, (x) =>
      x.query<{ e: Record<string, unknown> }>('select public.exporter_mes_donnees() as e'),
    )
    expect(JSON.stringify(rows[0]!.e['journal_acces'])).toContain('lecture-dossier')
  })

  it('Bob n’exporte PAS le profil d’Alice', async () => {
    // La fonction s'exécute avec les droits de l'appelant : Bob obtient le
    // sien, jamais celui d'un autre.
    const { rows } = await asUser(c, bob, (x) =>
      x.query<{ e: Record<string, unknown> }>('select public.exporter_mes_donnees() as e'),
    )
    expect(JSON.stringify(rows[0]!.e)).not.toContain('Wave Sénégal')
    expect(JSON.stringify(rows[0]!.e)).not.toContain('CV envoyé le 26')
  })
})

describe('suppression — elle ARRÊTE avant d’effacer', () => {
  it('la demande pose l’état ET l’arrêt d’urgence', async () => {
    // Deux garanties valent mieux qu'une quand la seconde coûte une colonne :
    // si un chemin de code oubliait de consulter `suppression_demandee_le`, il
    // consulterait `arret_urgence_le`.
    await asUserPersistant(c, alice, (x) => x.query('select public.demander_ma_suppression()'))
    const { rows } = await c.query<{ s: string | null; a: string | null }>(
      'select suppression_demandee_le as s, arret_urgence_le as a from public.profiles where id = $1',
      [profilAlice],
    )
    expect(rows[0]!.s).not.toBeNull()
    expect(rows[0]!.a).not.toBeNull()
  })

  it('elle N’EFFACE rien — les données sont encore là', async () => {
    // C'est le point : « demander » et « effacer » sont deux moments, et le
    // premier existe pour fermer la fenêtre pendant laquelle le second court.
    const { rows } = await c.query('select 1 from public.experiences where profile_id = $1', [profilAlice])
    expect(rows).toHaveLength(1)
  })

  it('elle est ANNULABLE tant que l’effacement n’a pas commencé', async () => {
    // Une demande faite par erreur, ou sous le coup d'une décision qu'on
    // regrette, doit pouvoir être reprise — sinon la fenêtre de réflexion
    // n'existe que pour ceux qui savent qu'elle existe.
    await asUserPersistant(c, alice, (x) => x.query('select public.annuler_ma_suppression()'))
    const { rows } = await c.query<{ s: string | null }>(
      'select suppression_demandee_le as s from public.profiles where id = $1', [profilAlice],
    )
    expect(rows[0]!.s).toBeNull()
  })

  it('elle n’est PLUS annulable une fois l’effacement commencé', async () => {
    await c.query(
      'update public.profiles set suppression_demandee_le = now(), suppression_effectuee_le = now() where id = $1',
      [profilAlice],
    )
    await asUserPersistant(c, alice, (x) => x.query('select public.annuler_ma_suppression()'))
    const { rows } = await c.query<{ s: string | null }>(
      'select suppression_demandee_le as s from public.profiles where id = $1', [profilAlice],
    )
    expect(rows[0]!.s).not.toBeNull()
    await c.query('update public.profiles set suppression_effectuee_le = null where id = $1', [profilAlice])
  })

  it('Bob ne demande pas la suppression du compte d’Alice', async () => {
    // La fonction lit `auth.uid()` : il n'y a pas de paramètre à falsifier.
    await asUserPersistant(c, bob, (x) => x.query('select public.demander_ma_suppression()'))
    const { rows } = await c.query<{ s: string | null }>(
      'select suppression_demandee_le as s from public.profiles where user_id = $1', [bob],
    )
    expect(rows[0]!.s).not.toBeNull()
  })
})
