import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asUser, creerCompte } from '@job-seeker/testing'
import { peutAgirSeule, peutProposer } from '@job-seeker/profil'

/**
 * JOB-081 — les DÉFAUTS de la base, qui sont la vraie garde.
 *
 * Un défaut permissif prend une confiance qu'on n'a pas donnée, et personne ne
 * s'en aperçoit : rien ne casse, ça marche « mieux ». C'est exactement le
 * genre de réglage qu'un test doit tenir, parce qu'aucune relecture de code
 * ne le remarque une fois qu'il est en place.
 */

let c: pg.Client
let alice: string
let profilAlice: string

beforeAll(async () => {
  c = await admin()
  await c.query("delete from auth.users where email like '%@autonomie.test'")
  alice = await creerCompte(c, 'alice@autonomie.test')
  profilAlice = (await c.query<{ id: string }>(
    'select id from public.profiles where user_id = $1', [alice],
  )).rows[0]!.id
}, 40_000)

afterAll(async () => {
  await c.query("delete from auth.users where email like '%@autonomie.test'")
  await c.end()
})

describe('un profil neuf ne peut rien envoyer', () => {
  it('son cadran est sur « proposer », jamais plus haut', async () => {
    const { rows } = await c.query<{ cran_autonomie: string }>(
      'select cran_autonomie from public.profiles where id = $1', [profilAlice],
    )
    expect(rows[0]!.cran_autonomie).toBe('proposer')
  })

  it('son parcours n’est pas terminé — donc rien ne part', async () => {
    const { rows } = await c.query<{ parcours_termine_le: string | null }>(
      'select parcours_termine_le from public.profiles where id = $1', [profilAlice],
    )
    expect(rows[0]!.parcours_termine_le).toBeNull()

    // La règle partagée lit exactement ces deux colonnes.
    const etat = { cran: 'agir-seul' as const, parcoursTermineLe: null, mandatValide: true }
    expect(peutAgirSeule(etat).autorise).toBe(false)
    expect(peutProposer(etat).autorise).toBe(false)
  })

  it('le cadran ne monte QUE par une valeur du vocabulaire', async () => {
    // La contrainte est portée par le type énuméré : un formulaire trafiqué
    // ne peut pas y semer une valeur que le code ne sait pas lire — ce qui la
    // ferait ignorer, donc désactiver la garde en silence.
    await expect(
      c.query("update public.profiles set cran_autonomie = 'tout-permis' where id = $1", [profilAlice]),
    ).rejects.toThrow(/invalid input value|type/i)
  })

  it('la personne peut régler SON cadran, et seulement le sien', async () => {
    const { rowCount } = await asUser(c, alice, (x) =>
      x.query("update public.profiles set cran_autonomie = 'agir-apres-accord' where id = $1", [profilAlice]),
    )
    expect(rowCount).toBe(1)

    const bob = await creerCompte(c, 'bob@autonomie.test')
    const profilBob = (await c.query<{ id: string }>(
      'select id from public.profiles where user_id = $1', [bob],
    )).rows[0]!.id
    const { rowCount: autrui } = await asUser(c, alice, (x) =>
      x.query("update public.profiles set cran_autonomie = 'agir-seul' where id = $1", [profilBob]),
    )
    expect(autrui).toBe(0)
  })

  it('un parcours terminé au cran maximal reste bloqué SANS mandat', async () => {
    // REQ-009 : « agir seul » exige un mandat horodaté, précédé d'un aperçu
    // intégral. Terminer son installation ne le remplace pas.
    const etat = { cran: 'agir-seul' as const, parcoursTermineLe: '2026-08-26T10:00:00Z', mandatValide: false }
    expect(peutAgirSeule(etat).autorise).toBe(false)
    expect(peutAgirSeule({ ...etat, mandatValide: true }).autorise).toBe(true)
  })
})
