import type pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { admin } from '@job-seeker/testing'

/**
 * JOB-006 — le profil naît avec le compte, une seule fois.
 *
 * Le vrai risque n'est pas le cas nominal : c'est la course. Deux connexions
 * simultanées, ou un callback rejoué, qui produiraient deux profils pour une
 * même personne. Un `select` puis `insert` côté application ne ferme pas cette
 * course — deux processus se croisent toujours entre les deux. La garantie
 * doit venir de la base, et ces tests l'y cherchent.
 */

let db: pg.Client
const marque = '%@provisionnement.test'

const creerUtilisateur = (c: pg.Client, email: string, meta = '{}') =>
  c.query<{ id: string }>(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, created_at, updated_at, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
             'authenticated', $1, '', now(), now(), now(), $2::jsonb)
     returning id`,
    [email, meta],
  )

beforeAll(async () => { db = await admin() }, 30_000)
afterEach(async () => { await db.query('delete from auth.users where email like $1', [marque]) })
afterAll(async () => { await db.end() })

describe('provisionnement du profil', () => {
  it('un compte créé obtient exactement UN profil, sans que le code applicatif intervienne', async () => {
    const { rows } = await creerUtilisateur(db, 'a@provisionnement.test')
    const id = rows[0]?.id
    const { rows: profils } = await db.query('select user_id from public.profiles where user_id = $1', [id])
    expect(profils).toHaveLength(1)
  })

  it('le nom affiché vient des métadonnées du compte quand elles existent', async () => {
    await creerUtilisateur(db, 'b@provisionnement.test', JSON.stringify({ display_name: 'Léa' }))
    const { rows } = await db.query<{ display_name: string }>(
      "select display_name from public.profiles p join auth.users u on u.id = p.user_id where u.email = 'b@provisionnement.test'",
    )
    expect(rows[0]?.display_name).toBe('Léa')
  })

  it('une chaîne vide ne devient pas un nom affiché vide', async () => {
    await creerUtilisateur(db, 'c@provisionnement.test', JSON.stringify({ display_name: '' }))
    const { rows } = await db.query<{ display_name: string | null }>(
      "select display_name from public.profiles p join auth.users u on u.id = p.user_id where u.email = 'c@provisionnement.test'",
    )
    expect(rows[0]?.display_name).toBeNull()
  })

  it('DENY : une seconde tentative de provisionnement ne crée pas un second profil', async () => {
    const { rows } = await creerUtilisateur(db, 'd@provisionnement.test')
    const id = rows[0]?.id
    // Rejoue exactement ce que ferait un callback rejoué.
    await db.query('select public.provisionner_profil()', []).catch(() => undefined)
    await db.query(
      'insert into public.profiles (user_id) values ($1) on conflict (user_id) do nothing',
      [id],
    )
    const { rows: profils } = await db.query('select 1 from public.profiles where user_id = $1', [id])
    expect(profils, 'un second profil a été créé').toHaveLength(1)
  })

  it('DENY : la contrainte d’unicité ferme la course, pas le code applicatif', async () => {
    const { rows } = await creerUtilisateur(db, 'e@provisionnement.test')
    const id = rows[0]?.id
    // Sans `on conflict`, une seconde insertion DOIT échouer : c'est la base
    // qui garantit l'unicité, pas une vérification applicative qui se ferait
    // doubler par un processus concurrent.
    await expect(
      db.query('insert into public.profiles (user_id) values ($1)', [id]),
    ).rejects.toThrow(/duplicate key|unique/i)
  })

  it('la fonction est armée contre l’injection de schéma', async () => {
    const { rows } = await db.query<{ config: string[] | null; secdef: boolean }>(
      `select p.proconfig as config, p.prosecdef as secdef
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'provisionner_profil'`,
    )
    // security definer sans search_path figé est une escalade de privilège qui
    // attend : l'appelant choisit alors quel `profiles` la fonction écrit.
    expect(rows[0]?.secdef, 'la fonction doit être security definer').toBe(true)
    expect(rows[0]?.config?.join(','), 'search_path non figé').toContain('search_path=')
  })
})
