import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asAnon, asUser, asUserPersistant, creerCompte } from '@job-seeker/testing'

/**
 * JOB-033 — l'historique du profil, éprouvé contre la vraie base.
 *
 * Deux propriétés, et elles ne sont pas du même ordre.
 *
 * La première est une garantie d'AUTORISATION : personne ne lit l'historique
 * d'autrui, et personne ne le RÉÉCRIT — pas même son propriétaire. Un
 * historique modifiable ne prouve rien.
 *
 * La seconde est une garantie de JUSTESSE : une version figée juste après une
 * modification doit contenir cette modification. C'est le pire défaut possible
 * pour un historique — présent, daté, et faux — et c'est aussi le plus facile
 * à laisser passer, parce que rien ne le signale.
 */

let c: pg.Client
let alice: string
let bob: string
let profilAlice: string
let profilBob: string

const profilDe = async (userId: string): Promise<string> => {
  const { rows } = await c.query<{ id: string }>(
    'select id from public.profiles where user_id = $1', [userId],
  )
  const id = rows[0]?.id
  if (id === undefined) throw new Error('profil introuvable')
  return id
}

// `asUserPersistant`, pas `asUser` : un historique se prouve dans la DURÉE.
// Avec une transaction annulée à chaque appel, chaque `figer` repartirait d'une
// base vide et le test passerait au vert sans jamais rien vérifier.
const figer = async (userId: string, profileId: string): Promise<string> =>
  asUserPersistant(c, userId, async (x) => {
    const { rows } = await x.query<{ figer_profil: string }>(
      'select public.figer_profil($1)', [profileId],
    )
    return rows[0]!.figer_profil
  })

beforeAll(async () => {
  c = await admin()
  await c.query("delete from auth.users where email like '%@versions.test'")
  alice = await creerCompte(c, 'alice@versions.test')
  bob = await creerCompte(c, 'bob@versions.test')
  profilAlice = await profilDe(alice)
  profilBob = await profilDe(bob)
}, 40_000)

afterAll(async () => {
  await c.query("delete from auth.users where email like '%@versions.test'")
  await c.end()
})

describe('figer_profil', () => {
  it('crée une première version, puis rend la même tant que rien ne bouge', async () => {
    // Enregistrer cinq compétences, c'est cinq INSERT. Un instantané par
    // écriture produirait cinq versions identiques à la seconde près, et
    // l'historique deviendrait illisible au moment où il devient long.
    const a = await figer(alice, profilAlice)
    const b = await figer(alice, profilAlice)
    expect(b).toBe(a)
  })

  it('fige une NOUVELLE version dès que le profil change', async () => {
    const avant = await figer(alice, profilAlice)
    await c.query("update public.profiles set titre_accroche = 'Cheffe de projet' where id = $1", [profilAlice])
    const apres = await figer(alice, profilAlice)
    expect(apres).not.toBe(avant)
  })

  it("une expérience ajoutée est DANS la version figée juste après", async () => {
    // Le pire défaut possible : un historique présent, daté, et faux. Sans le
    // déclencheur qui remonte la modification vers le profil, `updated_at` ne
    // bougerait pas et cette expérience manquerait à la version suivante.
    await c.query(
      `insert into public.experiences (profile_id, employeur, intitule, debut)
       values ($1, 'Wave Sénégal', 'Responsable acquisition', '2021-01-01')`,
      [profilAlice],
    )
    const id = await figer(alice, profilAlice)
    const { rows } = await c.query<{ instantane: { experiences: { employeur: string }[] } }>(
      'select instantane from public.profil_versions where id = $1', [id],
    )
    expect(rows[0]!.instantane.experiences.map((e) => e.employeur)).toContain('Wave Sénégal')
  })

  it('les versions se suivent sans trou', async () => {
    const { rows } = await c.query<{ version: number }>(
      'select version from public.profil_versions where profile_id = $1 order by version', [profilAlice],
    )
    expect(rows.map((r) => r.version)).toEqual(rows.map((_, i) => i + 1))
  })

  it("refuse de figer le profil d'autrui", async () => {
    // La fonction n'est PAS `security definer` : elle s'exécute avec les
    // droits de l'appelant, donc la RLS de `profiles` s'applique et le profil
    // de Bob est simplement invisible pour Alice.
    await expect(figer(alice, profilBob)).rejects.toThrow(/introuvable ou inaccessible/)
  })
})

describe('ALLOW / DENY sur l’historique', () => {
  it("Alice lit ses versions, et seulement les siennes", async () => {
    await figer(bob, profilBob)
    const { rows } = await asUser(c, alice, (x) =>
      x.query('select profile_id from public.profil_versions'),
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows as { profile_id: string }[]) expect(r.profile_id).toBe(profilAlice)
  })

  it('personne ne RÉÉCRIT une version — pas même son propriétaire', async () => {
    // Le refus est PLUS FORT qu'une ligne invisible : le privilège `update`
    // n'est pas accordé du tout, donc Postgres refuse avant même de consulter
    // une politique. Une ligne invisible protège tant qu'une politique reste
    // juste ; un privilège absent protège tant qu'on ne l'accorde pas.
    await expect(
      asUser(c, alice, (x) =>
        x.query("update public.profil_versions set instantane = '{}'::jsonb where profile_id = $1", [profilAlice]),
      ),
    ).rejects.toThrow(/permission denied/i)
    await expect(
      asUser(c, alice, (x) =>
        x.query('delete from public.profil_versions where profile_id = $1', [profilAlice]),
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it("Alice ne fige rien dans l'historique de Bob", async () => {
    await expect(
      asUser(c, alice, (x) =>
        x.query(
          "insert into public.profil_versions (profile_id, version, instantane) values ($1, 999, '{}'::jsonb)",
          [profilBob],
        ),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('un visiteur non authentifié ne voit rien', async () => {
    // Là encore : pas de `grant` pour `anon`, donc la table n'existe pas pour
    // lui. C'est un refus plus net qu'un résultat vide, qui pourrait aussi
    // vouloir dire « il n'y a rien à voir ».
    await expect(
      asAnon(c, (x) => x.query('select id from public.profil_versions')),
    ).rejects.toThrow(/permission denied/i)
  })
})
