import pg from 'pg'

/**
 * La file durable (JOB-009).
 *
 * Trois propriétés, portées par le CADRE et non par chaque appelant, parce que
 * le worker fait des actions sortantes au nom de quelqu'un :
 *
 *  - DURABLE : la file vit dans Postgres. Un worker tué au milieu d'un travail
 *    ne le perd pas — son bail expire et le travail retourne à la file.
 *  - IDEMPOTENTE : la clé d'idempotence est obligatoire. Soumettre deux fois
 *    le même travail ne produit qu'un seul effet.
 *  - BORNÉE : les réessais sont comptés, l'attente croît, et l'échec définitif
 *    est VISIBLE plutôt que silencieux.
 */

export type JobState = 'queued' | 'running' | 'done' | 'failed'

export type Job = {
  readonly id: string
  readonly kind: string
  readonly payload: Record<string, unknown>
  readonly idempotencyKey: string
  readonly state: JobState
  readonly attempts: number
  readonly maxAttempts: number
  readonly runAt: Date
  readonly lastError: string | null
}

type Row = {
  id: string
  kind: string
  payload: Record<string, unknown>
  idempotency_key: string
  state: JobState
  attempts: number
  max_attempts: number
  run_at: Date
  last_error: string | null
}

const toJob = (r: Row): Job => ({
  id: r.id,
  kind: r.kind,
  payload: r.payload,
  idempotencyKey: r.idempotency_key,
  state: r.state,
  attempts: r.attempts,
  maxAttempts: r.max_attempts,
  runAt: r.run_at,
  lastError: r.last_error,
})

export type EnqueueInput = {
  readonly kind: string
  /**
   * Obligatoire. Un appelant sans clé naturelle doit en fabriquer une : c'est
   * ce qui empêche un rejeu après incident de produire une SECONDE action
   * sortante. Rendre ce champ optionnel reviendrait à rendre l'idempotence
   * optionnelle, et personne ne se souvient de l'activer.
   */
  readonly idempotencyKey: string
  readonly payload?: Record<string, unknown>
  readonly maxAttempts?: number
  readonly runAt?: Date
}

/**
 * Met un travail en file. Soumettre deux fois la même clé renvoie le travail
 * existant, INCHANGÉ — la deuxième soumission n'écrase ni l'état ni le nombre
 * de tentatives d'un travail déjà en cours.
 */
export async function enqueue(db: pg.Client | pg.Pool, input: EnqueueInput): Promise<Job> {
  const { rows } = await db.query<Row>(
    `insert into worker.jobs (kind, payload, idempotency_key, max_attempts, run_at)
     values ($1, $2::jsonb, $3, coalesce($4, 5), coalesce($5, now()))
     on conflict (idempotency_key) do update
        set idempotency_key = worker.jobs.idempotency_key -- no-op : renvoie la ligne existante
     returning *`,
    [
      input.kind,
      JSON.stringify(input.payload ?? {}),
      input.idempotencyKey,
      input.maxAttempts ?? null,
      input.runAt ?? null,
    ],
  )
  const row = rows[0]
  if (row === undefined) throw new Error('enqueue n’a rien renvoyé')
  return toJob(row)
}

/** Réclame un travail avec un bail, ou `null` si la file n'a rien pour nous. */
export async function claim(
  db: pg.Client | pg.Pool,
  workerId: string,
  options: { leaseSeconds?: number; kinds?: readonly string[] } = {},
): Promise<Job | null> {
  const { rows } = await db.query<Row>('select * from worker.claim_job($1, $2, $3)', [
    workerId,
    options.leaseSeconds ?? 60,
    options.kinds === undefined ? null : [...options.kinds],
  ])
  const row = rows[0]
  // claim_job renvoie une ligne vide quand la file n'a rien : id est alors null.
  return row === undefined || row.id === null ? null : toJob(row)
}

export async function complete(db: pg.Client | pg.Pool, jobId: string): Promise<void> {
  await db.query(
    `update worker.jobs
        set state = 'done', locked_by = null, lease_until = null, last_error = null
      where id = $1`,
    [jobId],
  )
}

/**
 * Attente exponentielle avec gigue. La gigue n'est pas cosmétique : sans elle,
 * mille travaux tombés en même temps sur une source indisponible reviennent
 * frapper en même temps, et l'attente devient une attaque contre soi-même.
 */
export function backoffSeconds(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(2 ** Math.max(0, attempts - 1), 300)
  return Math.round(base * (0.5 + random() * 0.5))
}

/**
 * Signale un échec. Tant qu'il reste des tentatives, le travail retourne à la
 * file avec une attente croissante. À l'épuisement, il passe en `failed` — un
 * état TERMINAL et VISIBLE, jamais un silence.
 */
export async function fail(
  db: pg.Client | pg.Pool,
  jobId: string,
  error: unknown,
  random: () => number = Math.random,
): Promise<Job> {
  const message = error instanceof Error ? error.message : String(error)
  const { rows } = await db.query<Row & { attempts: number; max_attempts: number }>(
    'select attempts, max_attempts from worker.jobs where id = $1',
    [jobId],
  )
  const row = rows[0]
  if (row === undefined) throw new Error(`travail introuvable : ${jobId}`)

  const epuise = row.attempts >= row.max_attempts
  const attente = epuise ? 0 : backoffSeconds(row.attempts, random)

  const { rows: out } = await db.query<Row>(
    `update worker.jobs
        set state = $2::worker.job_state,
            locked_by = null,
            lease_until = null,
            last_error = $3,
            run_at = now() + make_interval(secs => $4)
      where id = $1
      returning *`,
    [jobId, epuise ? 'failed' : 'queued', message.slice(0, 2000), attente],
  )
  const updated = out[0]
  if (updated === undefined) throw new Error(`travail introuvable : ${jobId}`)
  return toJob(updated)
}

/** Ce qu'une sonde de santé doit pouvoir dire : la file avance-t-elle ? */
export async function stats(db: pg.Client | pg.Pool): Promise<Record<JobState, number> & {
  oldestQueuedSeconds: number | null
}> {
  const { rows } = await db.query<{ state: JobState; n: string }>(
    'select state, count(*)::text as n from worker.jobs group by state',
  )
  const base: Record<JobState, number> = { queued: 0, running: 0, done: 0, failed: 0 }
  for (const r of rows) base[r.state] = Number(r.n)

  const { rows: age } = await db.query<{ secondes: number | null }>(
    `select extract(epoch from (now() - min(run_at)))::float8 as secondes
       from worker.jobs where state = 'queued' and run_at <= now()`,
  )
  return { ...base, oldestQueuedSeconds: age[0]?.secondes ?? null }
}
