import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin } from '@job-seeker/testing'

/**
 * F25 — Postgres accorde EXECUTE à PUBLIC par défaut sur toute fonction neuve.
 *
 * Une fonction `security definer` s'exécute sous les droits de son
 * propriétaire. Les deux faits ensemble donnent la règle qui compte : écrire
 * `create function ... security definer` sans rien d'autre met un passe-partout
 * à la portée de n'importe quel visiteur anonyme, en silence, et le code a l'air
 * parfaitement normal.
 *
 * Ce fichier existe parce que je m'y suis fait prendre : j'avais révoqué le
 * droit sur `consommer_jeton` et pas sur `purger_limitation`, dans la MÊME
 * migration. Une précaution qu'on applique à la main s'oublie à la deuxième
 * occasion — donc elle ne doit pas être appliquée à la main.
 */
let c: pg.Client

/**
 * Les fonctions `security definer` délibérément ouvertes à un rôle client.
 * Toute addition à cette liste est une décision de sécurité et doit être
 * justifiée ici, en une ligne.
 */
const OUVERTES_DELIBEREMENT: Record<string, string> = {
  'public.consommer_jeton':
    'JOB-073 — doit compter pour un visiteur NON authentifié (la demande de lien de connexion). ' +
    'N’accepte que trois scalaires bornés, n’expose aucune ligne, search_path épinglé.',
}

beforeAll(async () => { c = await admin() })
afterAll(async () => { await c.end() })

describe('fonctions security definer', () => {
  it('aucune n’est atteignable par un rôle client sans décision écrite', async () => {
    const { rows } = await c.query<{ nom: string; retour: string; anon: boolean; auth: boolean }>(
      `select n.nspname || '.' || p.proname as nom,
              t.typname as retour,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         join pg_type t on t.oid = p.prorettype
        where p.prosecdef and n.nspname in ('public', 'worker')
        order by nom`,
    )
    expect(rows.length, 'aucune fonction lue — la requête ne teste rien').toBeGreaterThan(0)

    const fautives = rows.filter(
      (r) =>
        (r.anon || r.auth) &&
        // Une fonction de déclencheur ne s'appelle pas directement : Postgres
        // refuse lui-même (« trigger functions can only be called as
        // triggers »). Vérifié, pas supposé — voir le test suivant.
        r.retour !== 'trigger' &&
        !(r.nom in OUVERTES_DELIBEREMENT),
    )
    expect(
      fautives.map((r) => r.nom),
      'fonction(s) security definer atteignables par un client sans décision écrite',
    ).toEqual([])
  })

  it('l’exemption des déclencheurs repose sur un refus RÉEL de Postgres', async () => {
    // L'exemption ci-dessus n'a de valeur que si la revendication est vraie.
    // On la vérifie sur les fonctions concernées plutôt que de la citer.
    const { rows } = await c.query<{ nom: string }>(
      `select p.proname as nom from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         join pg_type t on t.oid = p.prorettype
        where p.prosecdef and n.nspname = 'public' and t.typname = 'trigger'`,
    )
    expect(rows.length, 'aucune fonction de déclencheur — le test ne prouve rien').toBeGreaterThan(0)
    for (const { nom } of rows) {
      await c.query('begin')
      try {
        await c.query('set local role anon')
        await expect(c.query(`select public.${nom}()`), nom).rejects.toThrow(
          /can only be called as triggers|permission denied/i,
        )
      } finally {
        await c.query('rollback')
      }
    }
  })

  it('chaque exemption porte une justification, pas seulement un nom', () => {
    for (const [nom, pourquoi] of Object.entries(OUVERTES_DELIBEREMENT)) {
      expect(pourquoi.length, `${nom} : justification trop courte pour être une décision`)
        .toBeGreaterThan(60)
    }
  })
})
