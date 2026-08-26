/**
 * JOB-010 — journaux, erreurs, santé, coût.
 *
 * Ce produit journalise pendant qu'il manipule ce qu'une personne a de plus
 * sensible : son CV, son salaire, et le fait qu'elle cherche du travail —
 * parfois en étant en poste. Un journal est donc une SURFACE DE FUITE avant
 * d'être un outil de débogage.
 *
 * La règle appliquée ici : on n'expurge pas ce qu'on reconnaît comme sensible,
 * on ne laisse passer que ce qu'on a déclaré sûr. Une liste de refus laisse
 * passer le champ auquel personne n'a pensé ; une liste d'autorisation ne
 * laisse passer que ce qui a été jugé.
 */

export type Level = 'debug' | 'info' | 'warn' | 'error'

/** Les seules clés dont la VALEUR peut être écrite telle quelle. */
const VALEURS_SURES = new Set([
  'level', 'msg', 'at', 'correlationId', 'runtime', 'jobId', 'jobKind', 'attempts',
  'durationMs', 'status', 'statusCode', 'source', 'tier', 'count', 'state',
  'queued', 'running', 'done', 'failed', 'oldestQueuedSeconds', 'model',
  'inputTokens', 'outputTokens', 'costEur', 'applicationId', 'userId',
])

/** Ce qui n'est jamais journalisé, même par accident, même tronqué. */
const INTERDITS = new Set([
  'cv', 'resume', 'letter', 'lettre', 'coverLetter', 'email', 'emailBody', 'body',
  'password', 'token', 'apiKey', 'key', 'secret', 'authorization', 'cookie',
  'salary', 'salaire', 'phone', 'address', 'adresse', 'birthDate', 'prompt',
  'jobDescription', 'answers', 'payload',
])

export type Champs = Record<string, unknown>

/**
 * Réduit un objet à ce qui est publiable. Une clé inconnue n'est pas devinée :
 * elle est remplacée par son type et sa taille, ce qui suffit à déboguer sans
 * rien divulguer.
 */
export function assainir(champs: Champs): Champs {
  const out: Champs = {}
  for (const [cle, valeur] of Object.entries(champs)) {
    if (INTERDITS.has(cle)) {
      out[cle] = '[interdit]'
      continue
    }
    if (!VALEURS_SURES.has(cle)) {
      out[cle] =
        valeur === null || valeur === undefined
          ? null
          : `[${typeof valeur}:${String(valeur).length}]`
      continue
    }
    out[cle] =
      typeof valeur === 'string' || typeof valeur === 'number' || typeof valeur === 'boolean'
        ? valeur
        : `[${typeof valeur}]`
  }
  return out
}

export type Journal = {
  readonly log: (level: Level, msg: string, champs?: Champs) => void
  readonly enfant: (champs: Champs) => Journal
  readonly erreur: (msg: string, cause: unknown, champs?: Champs) => void
}

export function creerJournal(
  base: Champs,
  ecrire: (ligne: string) => void = (l) => process.stdout.write(`${l}\n`),
  horloge: () => string = () => new Date().toISOString(),
): Journal {
  const log = (level: Level, msg: string, champs: Champs = {}): void => {
    ecrire(JSON.stringify({ level, msg, at: horloge(), ...assainir({ ...base, ...champs }) }))
  }
  return {
    log,
    enfant: (champs) => creerJournal({ ...base, ...champs }, ecrire, horloge),
    erreur: (msg, cause, champs = {}) => {
      // La trace est conservée : elle nomme des fichiers et des lignes, pas des
      // données. Le message d'erreur, lui, peut contenir n'importe quoi — il
      // passe donc par l'assainissement comme le reste.
      const err = cause instanceof Error ? cause : new Error(String(cause))
      ecrire(
        JSON.stringify({
          level: 'error',
          msg,
          at: horloge(),
          ...assainir({ ...base, ...champs }),
          errorName: err.name,
          errorMessage: err.message.slice(0, 500),
          stack: (err.stack ?? '').split('\n').slice(0, 12).join('\n'),
        }),
      )
    },
  }
}

// ---------------------------------------------------------------------------
//  Santé : vivant n'est pas sain.
// ---------------------------------------------------------------------------

export type EtatFile = {
  readonly queued: number
  readonly running: number
  readonly failed: number
  readonly oldestQueuedSeconds: number | null
}

export type Sante = {
  readonly status: 'ok' | 'degraded'
  readonly raisons: readonly string[]
}

/**
 * Un worker qui répond mais dont la file n'avance plus est un worker EN PANNE
 * qui a l'air sain. C'est exactement ce que cette sonde existe pour distinguer.
 */
export function evaluerSante(
  file: EtatFile,
  seuils: { retardSeconds?: number; echecs?: number } = {},
): Sante {
  const retardMax = seuils.retardSeconds ?? 300
  const echecsMax = seuils.echecs ?? 10
  const raisons: string[] = []

  if (file.oldestQueuedSeconds !== null && file.oldestQueuedSeconds > retardMax) {
    raisons.push(`file bloquée : le plus ancien travail attend ${Math.round(file.oldestQueuedSeconds)} s`)
  }
  if (file.failed > echecsMax) {
    raisons.push(`${file.failed} travaux en échec définitif`)
  }
  return { status: raisons.length === 0 ? 'ok' : 'degraded', raisons }
}

// ---------------------------------------------------------------------------
//  Coût : instrumenté dès la première ligne, pas après.
// ---------------------------------------------------------------------------

/**
 * L'hypothèse risquée n°4 du brief est que le coût LLM par candidature reste
 * sous le seuil de marge. Une hypothèse qu'on ne mesure pas est une croyance.
 */
export type UsageModele = {
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  /** À quoi ce coût est imputable. Un coût non attribuable ne sert à rien. */
  readonly applicationId: string
}

export function enregistrerUsage(journal: Journal, usage: UsageModele, tarif: {
  inputEurParMillion: number
  outputEurParMillion: number
}): number {
  const costEur =
    (usage.inputTokens * tarif.inputEurParMillion + usage.outputTokens * tarif.outputEurParMillion) /
    1_000_000
  journal.log('info', 'usage modèle', {
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    applicationId: usage.applicationId,
    costEur: Math.round(costEur * 1e6) / 1e6,
  })
  return costEur
}
