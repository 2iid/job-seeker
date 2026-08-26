import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asUser, creerCompte } from '@job-seeker/testing'

/**
 * JOB-034 / constat F22 — retirer une ligne, et seulement les siennes.
 *
 * La liste de ce qui reste INTERDIT compte autant que ce qui devient permis :
 * un historique effaçable ne prouve rien, et une candidature envoyée a eu lieu
 * — la retirer de la base ne la retire pas de la boîte mail du recruteur.
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
  return rows[0]!.id
}

beforeAll(async () => {
  c = await admin()
  await c.query("delete from auth.users where email like '%@suppr.test'")
  alice = await creerCompte(c, 'alice@suppr.test')
  bob = await creerCompte(c, 'bob@suppr.test')
  profilAlice = await profilDe(alice)
  profilBob = await profilDe(bob)
}, 40_000)

afterAll(async () => {
  await c.query("delete from auth.users where email like '%@suppr.test'")
  await c.end()
})

const SUPPRIMABLES = [
  { table: 'experiences', insere: "(profile_id, employeur, intitule, debut) values ($1, 'Payfit', 'PM', '2020-01-01')" },
  { table: 'formations', insere: "(profile_id, etablissement, intitule) values ($1, 'ISM', 'Master')" },
  { table: 'competences', insere: "(profile_id, libelle) values ($1, 'SQL')" },
  { table: 'employeurs_exclus', insere: "(profile_id, employeur_canonique) values ($1, 'acme')" },
] as const

describe('ALLOW — retirer ce qu’on a saisi par erreur', () => {
  it.each(SUPPRIMABLES)('$table : le propriétaire supprime sa ligne', async ({ table, insere }) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into public.${table} ${insere} returning id`, [profilAlice],
    )
    const { rowCount } = await asUser(c, alice, (x) =>
      x.query(`delete from public.${table} where id = $1`, [rows[0]!.id]),
    )
    expect(rowCount).toBe(1)
    await c.query(`delete from public.${table} where profile_id = $1`, [profilAlice])
  })
})

describe('DENY — et seulement les siennes', () => {
  it.each(SUPPRIMABLES)('$table : Bob ne supprime pas la ligne d’Alice', async ({ table, insere }) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into public.${table} ${insere} returning id`, [profilAlice],
    )
    const { rowCount } = await asUser(c, bob, (x) =>
      x.query(`delete from public.${table} where id = $1`, [rows[0]!.id]),
    )
    // Zéro ligne, pas une erreur : la politique rend la ligne invisible.
    expect(rowCount).toBe(0)
    const reste = await c.query(`select 1 from public.${table} where id = $1`, [rows[0]!.id])
    expect(reste.rows, 'la ligne doit toujours exister').toHaveLength(1)
    await c.query(`delete from public.${table} where profile_id = $1`, [profilAlice])
  })
})

describe('DENY — ce qui ne se supprime pas, même pour soi', () => {
  it('une version de critères : REQ-002 en dépend', async () => {
    await c.query(
      "insert into public.criteres_recherche (profile_id, version, intitules) values ($1, 1, array['PM'])",
      [profilAlice],
    )
    await expect(
      asUser(c, alice, (x) =>
        x.query('delete from public.criteres_recherche where profile_id = $1', [profilAlice]),
      ),
    ).rejects.toThrow(/permission denied/i)
    await c.query('delete from public.criteres_recherche where profile_id = $1', [profilAlice])
  })

  it('une candidature : elle a eu lieu', async () => {
    // La retirer de la base ne la retire pas de la boîte mail du recruteur, et
    // l'agent doit pouvoir dire ce qu'il a fait au nom de quelqu'un.
    await c.query(
      `insert into public.candidatures (profile_id, employeur, intitule, url_offre, source, palier)
       values ($1, 'Qonto', 'PM', 'https://x.test/1', 'ashby', 'a')`,
      [profilBob],
    )
    await expect(
      asUser(c, bob, (x) =>
        x.query('delete from public.candidatures where profile_id = $1', [profilBob]),
      ),
    ).rejects.toThrow(/permission denied/i)
    await c.query('delete from public.candidatures where profile_id = $1', [profilBob])
  })
})
