import type pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { admin } from '@job-seeker/testing'
import { backoffSeconds, claim, complete, enqueue, fail, stats } from './index.ts'

/**
 * JOB-009 — la file, éprouvée contre le vrai Postgres.
 *
 * Une file testée contre un double prouve que le double marche. Les propriétés
 * qui comptent ici — SKIP LOCKED, unicité, expiration de bail — sont des
 * propriétés de Postgres, donc c'est Postgres qui doit répondre.
 */

let db: pg.Client
let db2: pg.Client
const prefixe = 'test-file-'

beforeAll(async () => {
  db = await admin()
  db2 = await admin() // seconde connexion : la concurrence a besoin de deux clients réels
}, 30_000)

afterEach(async () => {
  await db.query('delete from worker.jobs where idempotency_key like $1', [`${prefixe}%`])
})

afterAll(async () => {
  await db.end()
  await db2.end()
})

describe('durabilité', () => {
  it('un travail mis en file survit — il est dans la base, pas en mémoire', async () => {
    const j = await enqueue(db, { kind: 'veille', idempotencyKey: `${prefixe}1`, payload: { a: 1 } })
    const { rows } = await db2.query('select id, payload from worker.jobs where id = $1', [j.id])
    expect(rows[0]).toMatchObject({ id: j.id, payload: { a: 1 } })
  })

  it('un travail dont le BAIL A EXPIRÉ retourne à la file', async () => {
    // C'est la propriété « survit à un redémarrage » : un worker tué au milieu
    // d'un travail ne le perd pas, il expire.
    const j = await enqueue(db, { kind: 'veille', idempotencyKey: `${prefixe}2` })
    const pris = await claim(db, 'worker-mort', { leaseSeconds: 1 })
    expect(pris?.id).toBe(j.id)

    // Personne d'autre ne peut le prendre tant que le bail court.
    expect(await claim(db2, 'worker-vivant')).toBeNull()

    await db.query("update worker.jobs set lease_until = now() - interval '1 second' where id = $1", [j.id])
    const repris = await claim(db2, 'worker-vivant')
    expect(repris?.id, 'le travail est resté bloqué chez un worker mort').toBe(j.id)
    expect(repris?.attempts).toBe(2)
  })
})

describe('idempotence — une propriété du cadre', () => {
  it('deux soumissions de la même clé ne créent qu’UN travail', async () => {
    const a = await enqueue(db, { kind: 'candidature', idempotencyKey: `${prefixe}3` })
    const b = await enqueue(db, { kind: 'candidature', idempotencyKey: `${prefixe}3` })
    expect(b.id).toBe(a.id)
    const { rows } = await db.query('select count(*)::int as n from worker.jobs where idempotency_key = $1', [
      `${prefixe}3`,
    ])
    expect(rows[0]).toMatchObject({ n: 1 })
  })

  it('une seconde soumission n’ÉCRASE pas un travail déjà en cours', async () => {
    // Le vrai risque : un rejeu après incident qui remettrait à zéro l'état
    // d'un travail en train de partir, et le ferait envoyer deux fois.
    const a = await enqueue(db, { kind: 'candidature', idempotencyKey: `${prefixe}4` })
    await claim(db, 'w1')
    const b = await enqueue(db2, { kind: 'candidature', idempotencyKey: `${prefixe}4` })
    expect(b.id).toBe(a.id)
    expect(b.state, 'la resoumission a remis le travail en file').toBe('running')
    expect(b.attempts).toBe(1)
  })
})

describe('concurrence', () => {
  it('deux workers ne réclament jamais le même travail', async () => {
    await enqueue(db, { kind: 'veille', idempotencyKey: `${prefixe}5a` })
    await enqueue(db, { kind: 'veille', idempotencyKey: `${prefixe}5b` })
    const [x, y] = await Promise.all([claim(db, 'w1'), claim(db2, 'w2')])
    expect(x).not.toBeNull()
    expect(y).not.toBeNull()
    expect(x?.id, 'les deux workers ont pris le MÊME travail').not.toBe(y?.id)
  })

  it('un worker spécialisé ne prend que les genres qui le concernent', async () => {
    // Sans les parenthèses extérieures dans claim_job, `and` liant plus fort
    // que `or`, ce filtre ne s'appliquait qu'à la branche de reprise.
    await enqueue(db, { kind: 'soumission', idempotencyKey: `${prefixe}6a` })
    const pris = await claim(db, 'w-veille', { kinds: ['veille'] })
    expect(pris, 'un worker « veille » a réclamé un travail de soumission').toBeNull()
  })
})

describe('réessais bornés et échec visible', () => {
  it('l’attente croît et reste bornée', () => {
    const sansGigue = () => 1
    expect(backoffSeconds(1, sansGigue)).toBe(1)
    expect(backoffSeconds(4, sansGigue)).toBe(8)
    expect(backoffSeconds(30, sansGigue), 'l’attente doit être plafonnée').toBe(300)
    // La gigue étale les réessais : sans elle, mille travaux tombés ensemble
    // reviennent frapper ensemble.
    expect(backoffSeconds(4, () => 0)).toBeLessThan(backoffSeconds(4, () => 1))
  })

  it('un échec renvoie en file avec une attente, tant qu’il reste des tentatives', async () => {
    const j = await enqueue(db, { kind: 'veille', idempotencyKey: `${prefixe}7`, maxAttempts: 3 })
    await claim(db, 'w1')
    const apres = await fail(db, j.id, new Error('source injoignable'))
    expect(apres.state).toBe('queued')
    expect(apres.lastError).toContain('source injoignable')
    expect(apres.runAt.getTime(), 'aucune attente : le réessai serait immédiat').toBeGreaterThan(Date.now())
  })

  it('à l’épuisement, l’échec est TERMINAL et visible', async () => {
    const j = await enqueue(db, { kind: 'veille', idempotencyKey: `${prefixe}8`, maxAttempts: 2 })
    await claim(db, 'w1')
    await fail(db, j.id, new Error('1'))
    await db.query("update worker.jobs set run_at = now() where id = $1", [j.id])
    await claim(db, 'w1')
    const final = await fail(db, j.id, new Error('2'))
    expect(final.state).toBe('failed')
    expect(final.lastError).toContain('2')
    // Un travail échoué ne revient pas discrètement dans la file.
    expect(await claim(db2, 'w2'), 'un travail « failed » a été re-réclamé').toBeNull()
  })

  it('un travail terminé ne repart jamais', async () => {
    const j = await enqueue(db, { kind: 'veille', idempotencyKey: `${prefixe}9` })
    await claim(db, 'w1')
    await complete(db, j.id)
    expect(await claim(db2, 'w2')).toBeNull()
  })
})

describe('observabilité de la file', () => {
  it('stats distingue un worker vivant d’un worker bloqué', async () => {
    await enqueue(db, { kind: 'veille', idempotencyKey: `${prefixe}10` })
    const s = await stats(db)
    expect(s.queued).toBeGreaterThanOrEqual(1)
    // Un worker qui tourne mais dont la file n'avance plus doit être
    // distinguable d'un worker sain : c'est l'âge du plus vieux travail en
    // attente qui le dit, pas le fait que le processus réponde.
    expect(s.oldestQueuedSeconds).not.toBeNull()
  })
})

describe('la file n’est pas exposée aux clients', () => {
  it('ni anon ni authenticated n’ont le moindre privilège sur worker', async () => {
    const { rows } = await db.query<{ grantee: string; table_name: string; privilege_type: string }>(
      `select grantee, table_name, privilege_type from information_schema.role_table_grants
        where table_schema = 'worker' and grantee in ('anon', 'authenticated')`,
    )
    expect(
      rows.map((r) => `${r.grantee}:${r.table_name}:${r.privilege_type}`),
      'un rôle client a des privilèges sur la file du worker',
    ).toEqual([])
  })

  it('le schéma worker n’est pas exposé par l’API', async () => {
    const { rows } = await db.query<{ usage: boolean }>(
      `select has_schema_privilege('anon', 'worker', 'USAGE') as usage`,
    )
    expect(rows[0]?.usage, 'anon peut atteindre le schéma worker').toBe(false)
  })
})
