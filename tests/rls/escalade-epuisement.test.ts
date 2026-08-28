import type pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { admin, creerCompte } from '@job-seeker/testing'
import { escaladerEpuisement } from '../../apps/worker/src/envoi/epuisement.ts'

/**
 * JOB-050 — « puis escaladé à l'humain ».
 *
 * Ce fichier vérifie le dernier tiers de l'exigence : qu'un travail dont les
 * réessais sont épuisés cesse d'être une ligne dans un compteur et devienne
 * quelque chose qu'une personne peut lire.
 */
let c: pg.Client
let profil: string
let opportunite: string

beforeAll(async () => {
  c = await admin()
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@epuise.test'")
  const u = await creerCompte(c, 'alice@epuise.test')
  profil = (await c.query<{ id: string }>(
    'select id from public.profiles where user_id = $1', [u])).rows[0]!.id
  const offre = (await c.query<{ id: string }>(
    `insert into public.offres (source, palier, identifiant_source, employeur_canonique,
                                employeur_affiche, titre, url_candidature)
     values ('test','a','ref-epuise-1','vireo','Groupe Vireo','Lead Backend',
             'https://exemple.invalid/1') returning id`)).rows[0]!.id
  opportunite = (await c.query<{ id: string }>(
    'insert into public.opportunites (profile_id, offre_id) values ($1,$2) returning id',
    [profil, offre])).rows[0]!.id
}, 30_000)

beforeEach(async () => {
  await c.query('delete from public.dossiers where opportunite_id = $1', [opportunite])
  await c.query("update public.opportunites set statut = 'en-file' where id = $1", [opportunite])
})

afterAll(async () => {
  await c.query("select set_config('app.suppression_compte', 'true', false)")
  await c.query("delete from auth.users where email like '%@epuise.test'")
  await c.query("delete from public.offres where identifiant_source = 'ref-epuise-1'")
  await c.end()
})

const epuiser = () =>
  escaladerEpuisement(c, {
    opportuniteId: opportunite, canal: 'email', tentatives: 5,
    derniereErreur: 'ECONNRESET https://interne.vireo/x?token=secret',
  })

describe('un réessai épuisé devient lisible', () => {
  it('écrit un dossier en escalade et passe l’opportunité en escalade', async () => {
    expect(await epuiser()).toBe(true)
    const { rows } = await c.query<{ statut: string; issue: string; motif: string }>(
      `select op.statut::text as statut, d.issue, d.issue_motif as motif
         from public.opportunites op join public.dossiers d on d.opportunite_id = op.id
        where op.id = $1`, [opportunite])
    expect(rows[0]).toEqual({
      statut: 'escalade', issue: 'refuse', motif: 'escalade-reessais-epuises',
    })
  })

  it('le message nomme l’employeur et le nombre de tentatives', async () => {
    await epuiser()
    const { rows } = await c.query<{ manques: string[] }>(
      'select manques from public.dossiers where opportunite_id = $1', [opportunite])
    const texte = rows[0]!.manques.join(' ')
    expect(texte).toContain('Groupe Vireo')
    expect(texte).toContain('5 tentatives')
  })

  it('et ne fait PAS fuiter l’erreur technique vers la personne', async () => {
    // L'erreur peut porter une URL interne ou un jeton. Elle appartient au
    // journal, pas à l'écran de quelqu'un qui cherche un emploi.
    await epuiser()
    const { rows } = await c.query<{ manques: string[] }>(
      'select manques from public.dossiers where opportunite_id = $1', [opportunite])
    const texte = rows[0]!.manques.join(' ')
    expect(texte).not.toContain('token')
    expect(texte).not.toContain('ECONNRESET')
    expect(texte).not.toContain('interne.vireo')
  })

  it('le profil du dossier vient de l’OPPORTUNITÉ, pas d’un paramètre', async () => {
    // F27 : un appelant pouvait passer deux identifiants incohérents. Ici le
    // désaccord ne peut pas être exprimé — il n'y a pas de paramètre.
    await epuiser()
    const { rows } = await c.query<{ n: number }>(
      `select count(*)::int as n from public.dossiers d
         join public.opportunites op on op.id = d.opportunite_id
        where d.opportunite_id = $1 and d.profile_id = op.profile_id`, [opportunite])
    expect(rows[0]!.n).toBe(1)
  })

  it('est idempotent : deux balayages ne produisent pas deux dossiers', async () => {
    await epuiser()
    await epuiser()
    const { rows } = await c.query<{ n: number }>(
      'select count(*)::int as n from public.dossiers where opportunite_id = $1', [opportunite])
    expect(rows[0]!.n).toBe(1)
  })
})

describe('ce qu’une escalade ne doit JAMAIS écraser', () => {
  it('un envoi déjà parti reste parti', async () => {
    // Un réessai postérieur qui s'épuise ne doit pas effacer la preuve de ce
    // qui a fonctionné — ce serait transformer un succès en échec.
    await c.query(
      `insert into public.dossiers (profile_id, opportunite_id, canal, issue,
                                    confirmation_reference, destination_adresse)
       values ($1,$2,'email','envoye','msg-1','rh@vireo.example')`, [profil, opportunite])
    await c.query("update public.opportunites set statut = 'envoyee' where id = $1", [opportunite])

    expect(await epuiser()).toBe(false)

    const { rows } = await c.query<{ statut: string; issue: string; ref: string }>(
      `select op.statut::text as statut, d.issue, d.confirmation_reference as ref
         from public.opportunites op join public.dossiers d on d.opportunite_id = op.id
        where op.id = $1`, [opportunite])
    expect(rows[0]).toEqual({ statut: 'envoyee', issue: 'envoye', ref: 'msg-1' })
  })

  it('une opportunité inconnue ne crée rien', async () => {
    expect(
      await escaladerEpuisement(c, {
        opportuniteId: '00000000-0000-0000-0000-000000000000', canal: 'email',
        tentatives: 3, derniereErreur: 'x',
      }),
    ).toBe(false)
  })
})
