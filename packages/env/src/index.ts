/**
 * The one place this project reads process.env.
 *
 * Two rules, both enforced rather than described:
 *   1. A missing or malformed variable fails at STARTUP, naming the variable —
 *      never a silent undefined that surfaces as a 500 on the first request.
 *   2. No default is ever supplied for a secret. A missing secret is an error,
 *      not an empty string.
 *
 * The lint config forbids `process.env` everywhere else in the repository.
 */

export type Runtime = 'web' | 'worker'

type Spec = {
  readonly name: string
  readonly required: readonly Runtime[]
  /** true = never leaves the server, never appears in a client bundle. */
  readonly secret: boolean
  readonly validate?: (raw: string) => string | null
}

const isUrl = (raw: string): string | null => {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? null : 'must be an http(s) URL'
  } catch {
    return 'must be a valid URL'
  }
}

const minLength =
  (n: number) =>
  (raw: string): string | null =>
    raw.length >= n ? null : `must be at least ${n} characters`

export const SPECS: readonly Spec[] = [
  { name: 'NODE_ENV', required: ['web', 'worker'], secret: false },
  { name: 'APP_URL', required: ['web'], secret: false, validate: isUrl },
  // Le préfixe NEXT_PUBLIC_ n'est pas cosmétique : dans Next.js, il est ce qui
  // décide qu'une valeur part dans le bundle du navigateur. Ces deux-là DOIVENT
  // y partir — le client Supabase du navigateur en a besoin — et le préfixe
  // rend ce choix visible à la lecture plutôt qu'implicite.
  //
  // Constat F2 de la revue de la PR #2 : la clé de service ne doit JAMAIS
  // suivre le même chemin. Elle reste requise par le seul runtime worker, sans
  // préfixe, et `secret: true` interdit qu'on lui donne une valeur par défaut.
  { name: 'NEXT_PUBLIC_SUPABASE_URL', required: ['web'], secret: false, validate: isUrl },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: ['web'], secret: false, validate: minLength(20) },
  { name: 'SUPABASE_URL', required: ['worker'], secret: false, validate: isUrl },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: ['worker'], secret: true, validate: minLength(20) },
  { name: 'ANTHROPIC_API_KEY', required: ['worker'], secret: true, validate: minLength(20) },
  // Optionnelle : `required: []`. Le produit fonctionne sans elle — simplement
  // sans bascule. La déclarer ici plutôt que de la lire ailleurs garde la porte
  // unique, et `secret: true` interdit qu'on lui donne une valeur par défaut.
  { name: 'OPENROUTER_API_KEY', required: [], secret: true, validate: minLength(20) },
  // JOB-073 — le sel de la limitation de débit. `secret: true` a ici un effet
  // concret et pas seulement documentaire : `redact()` le masque, donc il ne
  // peut pas se retrouver en clair dans un journal ou un rapport d'erreur. Le
  // fait qu'il soit ABSENT, en revanche, n'est pas contrôlé au démarrage — le
  // web ne passe pas par `loadEnv` — mais dans `empreinte()`, qui refuse de
  // condenser sans lui. C'est le seul endroit qui ne se contourne pas.
  { name: 'LIMITATION_SEL', required: [], secret: true, validate: minLength(16) },
  // Combien de relais VOUS opérez devant l'application. Publique, et sa valeur
  // par défaut est la plus prudente : 1 relais de confiance.
  { name: 'RELAIS_DE_CONFIANCE', required: [], secret: false },
]

export class EnvError extends Error {
  // Champ déclaré puis affecté, jamais une « parameter property » : Node
  // exécute ce TypeScript en retirant les types SANS compiler, et cette
  // syntaxe-là exige une transformation. La règle ESLint le rappelle.
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(
      `Environment is not usable — ${problems.length} problem(s):\n` +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\nSee .env.example. Nothing starts until every line above is fixed.',
    )
    this.problems = problems
    this.name = 'EnvError'
  }
}

/** Pure so it is testable: the reader is passed in, never reached for. */
export function readEnv(
  runtime: Runtime,
  source: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  const problems: string[] = []
  const out: Record<string, string> = {}

  for (const spec of SPECS) {
    if (!spec.required.includes(runtime)) continue
    const raw = source[spec.name]
    if (raw === undefined || raw.trim() === '') {
      problems.push(`${spec.name} is missing (required by the ${runtime} runtime)`)
      continue
    }
    const problem = spec.validate?.(raw)
    if (problem !== null && problem !== undefined) {
      problems.push(`${spec.name} ${problem}`)
      continue
    }
    out[spec.name] = raw
  }

  if (problems.length > 0) throw new EnvError(problems)
  return Object.freeze(out)
}

/** Never log a value; this is what error reporters and logs may print. */
export function redact(name: string, value: string): string {
  const spec = SPECS.find((s) => s.name === name)
  if (spec?.secret !== true) return value
  return value.length <= 8 ? '***' : `${value.slice(0, 3)}***${value.slice(-2)}`
}

export function loadEnv(runtime: Runtime): Readonly<Record<string, string>> {
  return readEnv(runtime, process.env)
}

/**
 * Lit une variable NON obligatoire, avec un repli explicite.
 *
 * Existe pour que la règle « process.env n'est lu qu'ici » n'ait aucune
 * exception : un harnais de test qui veut choisir sa base de données passe par
 * cette porte plutôt que d'en percer une seconde. Le repli est fourni par
 * l'appelant et doit être une valeur publique — jamais un secret : une valeur
 * par défaut secrète est un secret commité.
 */
/**
 * Lit un secret OPTIONNEL. Renvoie `undefined` quand il manque — jamais une
 * valeur de repli, parce qu'un secret par défaut est un secret commité.
 *
 * Sert aux capacités qui dégradent proprement : sans clé OpenRouter, le produit
 * marche, il n'a simplement plus de fournisseur de secours.
 */
export function readOptionalSecret(name: string): string | undefined {
  const raw = process.env[name]
  return raw === undefined || raw.trim() === '' ? undefined : raw.trim()
}

export function readOptional(name: string, fallback: string): string {
  if (SPECS.some((s) => s.name === name && s.secret)) {
    throw new Error(
      `${name} est déclarée secrète : elle ne peut pas avoir de valeur par défaut. ` +
        'Employez readEnv/loadEnv, qui échoue quand elle manque.',
    )
  }
  const raw = process.env[name]
  if (raw !== undefined && raw.trim() !== '') return raw.trim()

  // Un repli est une commodité de DÉVELOPPEMENT. En production, une variable
  // absente doit faire échouer bruyamment : un repli silencieux y produirait un
  // service qui démarre en pointant vers nulle part, et l'incident se
  // découvrirait par un utilisateur plutôt que par un déploiement refusé.
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      `${name} est absente. Un repli n'est admis qu'en développement : en ` +
        'production, une configuration manquante doit refuser de démarrer.',
    )
  }
  return fallback
}
