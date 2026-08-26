import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readOptional } from '@job-seeker/env'
import pg from 'pg'

/**
 * Les tests d'autorisation tournent contre la VRAIE base, jamais contre un
 * double. Une politique RLS testée par un simulacre ne prouve rien : c'est
 * Postgres qui l'applique, c'est donc Postgres qui doit répondre.
 */

const RACINE = join(import.meta.dirname, '..', '..', '..')

/**
 * L'URL vient de l'environnement, puis de `.env`, puis du défaut local
 * documenté dans supabase/README.md.
 *
 * Le repli existe pour une raison précise : `.env` est ignoré par git, donc il
 * n'existe pas dans le clone propre que `scripts/ci-local.sh` fabrique. Sans
 * lui, la contre-vérification indépendante ne pourrait pas tester la base —
 * c'est-à-dire précisément la partie qu'il faut le plus vérifier. La valeur de
 * repli n'est pas un secret : c'est le mot de passe par défaut d'une pile
 * Supabase locale, publié dans leur documentation et joignable seulement en
 * 127.0.0.1.
 */
const DEFAUT_LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54522/postgres'

function connectionString(): string {
  const depuisEnv = readOptional('DATABASE_URL', '')
  if (depuisEnv !== '') return depuisEnv
  try {
    const ligne = readFileSync(join(RACINE, '.env'), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('DATABASE_URL='))
    if (ligne !== undefined) return ligne.slice('DATABASE_URL='.length).trim()
  } catch {
    // pas de .env : c'est le cas normal dans un clone propre.
  }
  return DEFAUT_LOCAL
}

/** Connexion superutilisateur : elle CONTOURNE la RLS. Réservée au montage. */
export async function admin(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: connectionString(), connectionTimeoutMillis: 5000 })
  try {
    await c.connect()
  } catch (cause) {
    // Un test d'autorisation qu'on saute en silence est pire qu'un test absent :
    // la suite passe au vert sans que rien n'ait été vérifié.
    throw new Error(
      'Base locale injoignable. Ces tests s’exécutent contre une VRAIE base et ' +
        'ne se sautent pas. Lancez : supabase start',
      { cause },
    )
  }
  return c
}

/**
 * Exécute `fn` comme le ferait un utilisateur authentifié : rôle `authenticated`
 * et `auth.uid()` positionné, dans une transaction annulée à la fin. C'est le
 * chemin qu'emprunte réellement une requête venue du navigateur.
 */
export async function asUser<T>(
  client: pg.Client,
  userId: string,
  fn: (c: pg.Client) => Promise<T>,
): Promise<T> {
  await client.query('begin')
  try {
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    await client.query('set local role authenticated')
    return await fn(client)
  } finally {
    await client.query('rollback')
  }
}

/** Idem pour le rôle anonyme — celui d'un visiteur non connecté. */
export async function asAnon<T>(client: pg.Client, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  await client.query('begin')
  try {
    await client.query('set local role anon')
    return await fn(client)
  } finally {
    await client.query('rollback')
  }
}

/** Crée un compte réel dans auth.users et son profil. Renvoie l'id. */
export async function creerCompte(c: pg.Client, email: string): Promise<string> {
  const { rows } = await c.query<{ id: string }>(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
             'authenticated', $1, '', now(), now(), now())
     returning id`,
    [email],
  )
  const id = rows[0]?.id
  if (id === undefined) throw new Error('creation de compte impossible')
  // Le profil n'est PAS créé ici : le trigger de la base s'en charge. Le
  // harnais emprunte donc exactement le chemin du produit, plutôt qu'un
  // raccourci qui masquerait une régression du provisionnement.
  await c.query('update public.profiles set display_name = $2 where user_id = $1', [id, email])
  return id
}
