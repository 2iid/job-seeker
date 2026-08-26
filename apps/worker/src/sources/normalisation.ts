/**
 * JOB-020 — normaliser une offre venue de n'importe où.
 *
 * Deux pièges que ce fichier existe pour éviter :
 *
 *  1. L'ARGENT EN FLOTTANT. `0.1 + 0.2` ne fait pas `0.3`, et un salaire qui
 *     dérive d'un centime discrédite tout l'écran qui l'affiche. Les montants
 *     sont des ENTIERS d'unité mineure. Et toutes les devises n'ont pas deux
 *     décimales : le franc CFA et le yen n'en ont aucune. Une table d'exposants
 *     évite de diviser par 100 un montant qui ne le veut pas.
 *
 *  2. LA DATE SANS FUSEAU. « publiée à 9 h » ne veut rien dire sans savoir où.
 *     Tout est stocké en UTC, avec le fuseau d'origine conservé — REQ-004 exige
 *     d'afficher l'heure de l'offre ET celle du candidat.
 */

/** Nombre de décimales de la devise (ISO 4217). */
const EXPOSANTS: Record<string, number> = {
  EUR: 2, USD: 2, CAD: 2, GBP: 2, CHF: 2, AUD: 2, MAD: 2,
  XOF: 0, XAF: 0, JPY: 0, KRW: 0, CLP: 0,
}

export function exposant(devise: string): number {
  return EXPOSANTS[devise.toUpperCase()] ?? 2
}

/** Un montant est un ENTIER d'unité mineure. Jamais un flottant. */
export type Montant = {
  readonly unitesMineures: number
  readonly devise: string
}

export type Periode = 'heure' | 'jour' | 'mois' | 'an'

export type Remuneration = {
  readonly min?: Montant
  readonly max?: Montant
  readonly periode: Periode
  /** Le texte d'origine, conservé : on n'affiche jamais mieux que ce qu'on a lu. */
  readonly texteOrigine: string
}

const SYMBOLES: Record<string, string> = {
  '€': 'EUR', '$': 'USD', '£': 'GBP', 'FCFA': 'XOF', 'CFA': 'XOF', 'DH': 'MAD',
}

// Pas de `\b` en tête : il n'y a pas de frontière de mot avant une barre
// oblique, et « / mois » ne matchait donc jamais — le montant mensuel d'une
// offre dakaroise était lu comme un annuel, soit douze fois trop bas.
const MOTS_PERIODE: readonly (readonly [RegExp, Periode])[] = [
  [/(par heure|\/\s?h(eure)?\b|hourly|per hour|de l'heure)/i, 'heure'],
  [/(par jour|\/\s?j(our)?\b|daily|per day|journalier)/i, 'jour'],
  [/(par mois|\/\s?mois\b|mensuel|monthly|per month)/i, 'mois'],
  [/(par an|\/\s?an\b|annuel|yearly|annually|per year|brut annuel)/i, 'an'],
]

/** Combien d'unités d'une période dans une année. Base 52 semaines × 35 h. */
const PAR_AN: Record<Periode, number> = { heure: 1820, jour: 228, mois: 12, an: 1 }

function devineDevise(texte: string): string | null {
  const iso = /\b(EUR|USD|CAD|GBP|CHF|AUD|XOF|XAF|JPY|MAD)\b/i.exec(texte)
  if (iso?.[1] !== undefined) return iso[1].toUpperCase()
  for (const [symbole, code] of Object.entries(SYMBOLES)) {
    if (texte.toUpperCase().includes(symbole.toUpperCase())) return code
  }
  return null
}

function devinePeriode(texte: string): Periode {
  for (const [motif, periode] of MOTS_PERIODE) if (motif.test(texte)) return periode
  // Un salaire sans période explicite est presque toujours annuel dans une
  // offre d'emploi. Le supposer est un choix, et il est écrit ici.
  return 'an'
}

/** Convertit une valeur décimale lue dans un texte en unités mineures ENTIÈRES. */
export function versUnitesMineures(valeur: number, devise: string): number {
  return Math.round(valeur * 10 ** exposant(devise))
}

export function versDecimal(m: Montant): number {
  return m.unitesMineures / 10 ** exposant(m.devise)
}

/**
 * Lit une rémunération dans du texte libre. Renvoie `null` plutôt que de
 * deviner : un salaire inventé est pire qu'un salaire absent, parce qu'il sera
 * affiché avec le même aplomb que les autres.
 */
export function lireRemuneration(texte: string | undefined): Remuneration | null {
  if (texte === undefined || texte.trim() === '') return null

  const devise = devineDevise(texte)
  if (devise === null) return null

  // Espaces fines, insécables et virgules décimales : une offre française
  // écrit « 1 200 000 » et « 55,5 k€ ».
  const nettoye = texte
    // Espaces insecables et fines, ecrites en echappement : litterales, elles sont
    // invisibles a la relecture et ESLint les refuse a juste titre.
    .replaceAll(/[\u00A0\u202F\u2009]/g, ' ')
    .replaceAll(/(\d) (?=\d{3}\b)/g, '$1')
    .replaceAll(/(\d),(\d)/g, '$1.$2')

  // Une fourchette d'abord : « 65 – 78 k€ » se lit 65 000 à 78 000, jamais
  // 65 à 78 000. Le suffixe « k » se propage aux DEUX bornes, mais UNIQUEMENT
  // à l'intérieur de la fourchette — sinon « 2 jours de télétravail » dans la
  // même phrase deviendrait 2 000 €.
  const FOURCHETTE = /(\d+(?:\.\d+)?)\s*(k)?\s*(?:[-–—]|à|a|to|et)\s*(\d+(?:\.\d+)?)\s*(k)?/i
  const f = FOURCHETTE.exec(nettoye)

  let nombres: number[]
  if (f !== null) {
    const k = f[2] !== undefined || f[4] !== undefined
    nombres = [Number(f[1]), Number(f[3])].map((v) => (k && v < 1000 ? v * 1000 : v))
  } else {
    const SEUL = /(\d+(?:\.\d+)?)\s*(k)?/i
    const s = SEUL.exec(nettoye)
    if (s === null) return null
    const valeur = Number(s[1])
    nombres = [s[2] !== undefined ? valeur * 1000 : valeur]
  }

  // Un nombre resté sous mille n'est presque jamais un salaire : c'est un
  // nombre de jours de télétravail, un pourcentage, une année.
  nombres = nombres.filter((v) => Number.isFinite(v) && v >= 1000)
  if (nombres.length === 0) return null

  const periode = devinePeriode(texte)
  const [a, b] = [nombres[0] ?? 0, nombres[1]]
  const min: Montant = { unitesMineures: versUnitesMineures(a, devise), devise }
  const max: Montant | undefined =
    b === undefined ? undefined : { unitesMineures: versUnitesMineures(b, devise), devise }

  return { min, ...(max === undefined ? {} : { max }), periode, texteOrigine: texte }
}

/**
 * Ramène une rémunération à l'année, dans SA devise. Aucune conversion de
 * devise ici : convertir demande un taux, un taux a une date, et une valeur
 * convertie doit être affichée COMME une conversion (REQ-004). Mélanger les
 * deux ferait passer une estimation pour un montant annoncé.
 */
export function annualiser(r: Remuneration): { min?: Montant; max?: Montant; devise: string } {
  const facteur = PAR_AN[r.periode]
  const conv = (m: Montant | undefined): Montant | undefined =>
    m === undefined ? undefined : { unitesMineures: m.unitesMineures * facteur, devise: m.devise }
  const devise = r.min?.devise ?? r.max?.devise ?? 'EUR'
  const min = conv(r.min)
  const max = conv(r.max)
  return { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }), devise }
}

export type Conversion = {
  readonly montant: Montant
  /** Toujours vrai : une conversion est une estimation, et doit se présenter comme telle. */
  readonly estEstimation: true
  readonly taux: number
  readonly tauxDate: string
  readonly origine: Montant
}

/** Convertit, en marquant le résultat comme une estimation datée. */
export function convertir(m: Montant, vers: string, taux: number, tauxDate: string): Conversion {
  const decimal = versDecimal(m) * taux
  return {
    montant: { unitesMineures: versUnitesMineures(decimal, vers), devise: vers.toUpperCase() },
    estEstimation: true,
    taux,
    tauxDate,
    origine: m,
  }
}

// ---------------------------------------------------------------------------
//  Dates
// ---------------------------------------------------------------------------

export type Publication = {
  /** Toujours UTC. */
  readonly instant: Date
  /** Le fuseau tel que la source l'a donné, ou null si elle n'a rien dit. */
  readonly fuseauOrigine: string | null
  /** Vrai quand la source n'a donné qu'une date sans heure : midi UTC assumé. */
  readonly precisionJour: boolean
}

/**
 * Lit une date de publication. Une date sans heure n'est pas ramenée à minuit :
 * minuit fait paraître une offre plus vieille d'un jour dans la moitié des
 * fuseaux, et la fraîcheur est la promesse du produit.
 */
export function lirePublication(brut: string | undefined): Publication | null {
  if (brut === undefined || brut.trim() === '') return null

  const seulementDate = /^\d{4}-\d{2}-\d{2}$/.test(brut.trim())
  const instant = new Date(seulementDate ? `${brut.trim()}T12:00:00Z` : brut)
  if (Number.isNaN(instant.getTime())) return null

  const fuseau = /([+-]\d{2}:?\d{2}|Z)$/.exec(brut.trim())
  return {
    instant,
    fuseauOrigine: seulementDate ? null : (fuseau?.[1] ?? null),
    precisionJour: seulementDate,
  }
}

/** L'âge en secondes, borné à zéro : une source qui date du futur ne rajeunit rien. */
export function ageSecondes(p: Publication, maintenant: Date = new Date()): number {
  return Math.max(0, Math.floor((maintenant.getTime() - p.instant.getTime()) / 1000))
}
