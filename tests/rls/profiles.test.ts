import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, asAnon, asUser, creerCompte } from './helpers'

/**
 * JOB-005 — le socle d'autorisation.
 *
 * Chaque politique a DEUX tests : un qui prouve qu'elle laisse passer ce
 * qu'elle doit, un qui prouve qu'elle refuse le reste. Un test d'autorisation
 * sans son test de refus ne prouve rien : une politique `using (true)` le
 * passerait.
 */

let c: pg.Client
let alice: string
let bob: string

beforeAll(async () => {
  c = await admin()
  await c.query("delete from auth.users where email like '%@rls.test'")
  alice = await creerCompte(c, 'alice@rls.test')
  bob = await creerCompte(c, 'bob@rls.test')
}, 30_000)

afterAll(async () => {
  await c.query("delete from auth.users where email like '%@rls.test'")
  await c.end()
})

describe('profiles — lecture', () => {
  it('ALLOW : Alice lit son propre profil', async () => {
    const r = await asUser(c, alice, (x) =>
      x.query('select user_id, display_name from public.profiles'),
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ user_id: alice, display_name: 'alice@rls.test' })
  })

  it('DENY : Alice ne voit AUCUNE ligne de Bob', async () => {
    // La RLS ne renvoie pas une erreur en lecture : elle fait disparaître les
    // lignes. Le test doit donc porter sur le CONTENU, jamais sur une exception.
    const r = await asUser(c, alice, (x) =>
      x.query('select user_id from public.profiles where user_id = $1', [bob]),
    )
    expect(r.rows).toEqual([])
  })

  it('DENY : un visiteur anonyme ne lit rien du tout', async () => {
    await expect(
      asAnon(c, (x) => x.query('select user_id from public.profiles')),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('profiles — écriture', () => {
  it('ALLOW : Alice met à jour son propre nom', async () => {
    const r = await asUser(c, alice, (x) =>
      x.query('update public.profiles set display_name = $1 where user_id = $2 returning display_name', [
        'Alice M.',
        alice,
      ]),
    )
    expect(r.rows[0]).toMatchObject({ display_name: 'Alice M.' })
  })

  it('DENY : Alice ne peut pas modifier le profil de Bob', async () => {
    const r = await asUser(c, alice, (x) =>
      x.query('update public.profiles set display_name = $1 where user_id = $2 returning user_id', [
        'piraté',
        bob,
      ]),
    )
    expect(r.rowCount, "l'update a touché une ligne de Bob").toBe(0)
  })

  it("DENY : Alice ne peut pas s'inventer un second profil au nom de Bob", async () => {
    await expect(
      asUser(c, alice, (x) =>
        x.query('insert into public.profiles (user_id) values ($1)', [bob]),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('DENY : personne ne supprime un profil directement', async () => {
    // La suppression passe par le parcours de suppression de compte (REQ-014),
    // qui doit d'abord ARRÊTER l'automatisation. Un DELETE direct la
    // court-circuiterait.
    //
    // Le refus arrive ici au niveau du PRIVILÈGE, pas de la politique : DELETE
    // n'est pas accordé au rôle `authenticated`. C'est plus fort — et c'est de
    // la défense en profondeur : si quelqu'un ajoute un jour une politique
    // DELETE par inadvertance, l'absence de GRANT bloque encore ; et si
    // quelqu'un accorde le privilège, l'absence de politique bloque toujours.
    // Il faut se tromper deux fois pour ouvrir la porte.
    await expect(
      asUser(c, alice, (x) => x.query('delete from public.profiles where user_id = $1', [alice])),
    ).rejects.toThrow(/permission denied/i)
  })

  it('DENY : le privilège DELETE n’est accordé à personne côté client', async () => {
    const { rows } = await c.query<{ grantee: string }>(
      `select grantee from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'profiles'
          and privilege_type = 'DELETE' and grantee in ('anon', 'authenticated')`,
    )
    expect(rows.map((r) => r.grantee), 'DELETE accordé à un rôle client').toEqual([])
  })

  it("DENY : updated_at est tenu par la base, pas par l'appelant", async () => {
    const r = await asUser(c, alice, (x) =>
      x.query(
        `update public.profiles set display_name = 'x', updated_at = '1999-01-01'
         where user_id = $1 returning updated_at`,
        [alice],
      ),
    )
    const ecrit = new Date(String(r.rows[0]?.updated_at))
    expect(ecrit.getFullYear(), 'la valeur envoyée par le client a été acceptée').toBeGreaterThan(2020)
  })
})

describe('le socle lui-même', () => {
  it('AUCUNE table de public sans RLS activée ET forcée', async () => {
    // C'est ce test qui rend le socle réel : une table ajoutée demain sans
    // politique fait échouer la suite, plutôt que d'attendre une revue humaine.
    const { rows } = await c.query<{ nom: string; activee: boolean; forcee: boolean }>(
      `select c.relname as nom, c.relrowsecurity as activee, c.relforcerowsecurity as forcee
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by c.relname`,
    )
    expect(rows.length, 'aucune table lue — la requête ne teste rien').toBeGreaterThan(0)
    const fautives = rows.filter((r) => !r.activee || !r.forcee)
    expect(
      fautives.map((r) => `${r.nom} (activée: ${r.activee}, forcée: ${r.forcee})`),
      'table(s) sans RLS activée et forcée',
    ).toEqual([])
  })

  it('aucune table protégée sans au moins une politique', async () => {
    const { rows } = await c.query<{ nom: string }>(
      `select c.relname as nom
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
          and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
    )
    // Une table avec RLS et zéro politique refuse tout : sûr, mais c'est
    // presque toujours un oubli plutôt qu'une intention.
    expect(rows.map((r) => r.nom), 'table(s) avec RLS mais aucune politique').toEqual([])
  })

  it('aucune politique « for all » — une règle par opération', async () => {
    const { rows } = await c.query<{ table_name: string; policyname: string }>(
      `select tablename as table_name, policyname from pg_policies
        where schemaname = 'public' and cmd = 'ALL'`,
    )
    expect(
      rows.map((r) => `${r.table_name}.${r.policyname}`),
      "politique « for all » : elle rend lecture et écriture indistinguables",
    ).toEqual([])
  })
})
