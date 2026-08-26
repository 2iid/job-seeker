/**
 * JOB-019 — le contrat qu'une source doit remplir pour entrer dans le moteur.
 *
 * ADR-0002 : ajouter un marché ou un secteur doit être l'écriture d'un
 * CONNECTEUR, jamais une modification du moteur. Ce fichier est ce qui rend
 * cette promesse vérifiable : tout ce dont le moteur a besoin pour décider
 * quand, à quelle cadence et avec quelle confiance interroger une source est
 * déclaré ici, par la source elle-même.
 *
 * La règle qui structure le reste : un ÉCHEC n'est jamais présenté comme une
 * absence d'offres. C'est la faute qui rendrait ce produit menteur — dire
 * « rien pour vous aujourd'hui » alors qu'on n'a simplement pas su regarder.
 */

/** Les trois paliers d'ADR-0002. Ce qu'on a le droit de promettre en dépend. */
export type Palier = 'a' | 'b' | 'c'

export type RegimeAcces =
  /** API publique, sans clé, sans condition restrictive. */
  | 'libre'
  /** API officielle nécessitant une clé que nous détenons. */
  | 'cle'
  /** Conditions d'utilisation interdisant la collecte automatisée. */
  | 'assiste-uniquement'

/**
 * L'issue d'une récolte. `aucun-resultat` est le SEUL état qui autorise à dire
 * « cette source n'avait rien ». Tous les autres signifient « je ne sais pas »,
 * et l'interface doit le refléter (REQ-003, REQ-004).
 */
export type EtatSource =
  | 'ok'
  | 'aucun-resultat'
  | 'partiel'
  | 'quota-atteint'
  | 'auth-refusee'
  | 'injoignable'
  | 'delai-depasse'
  | 'format-change'
  | 'non-configure'
  | 'erreur'

/** Les états qui signifient « je n'ai pas pu regarder ». */
export const ETATS_AVEUGLES: readonly EtatSource[] = [
  'partiel', 'quota-atteint', 'auth-refusee', 'injoignable',
  'delai-depasse', 'format-change', 'non-configure', 'erreur',
] as const

export function estAveugle(etat: EtatSource): boolean {
  return ETATS_AVEUGLES.includes(etat)
}

/**
 * Une source ne DOIT jamais laisser croire à une couverture qu'elle n'a pas.
 * Cette fonction est le point unique où cette règle s'applique.
 */
export function couvertureAffirmable(etat: EtatSource): boolean {
  return etat === 'ok' || etat === 'aucun-resultat'
}

/** Une offre telle que la source la rend, avant toute normalisation. */
export type OffreBrute = {
  readonly identifiantSource: string
  readonly titre: string
  readonly employeur: string
  readonly urlCandidature: string
  readonly publieeLe?: string
  readonly lieu?: string
  readonly remunerationTexte?: string
  readonly description?: string
  readonly teletravailTexte?: string
}

export type Recolte = {
  readonly etat: EtatSource
  readonly offres: readonly OffreBrute[]
  /** Ce que la source a dit d'elle-même : quota restant, en-tête de cadence… */
  readonly note?: string
}

export type ContexteRecolte = {
  readonly requete: string
  readonly pays?: string
  readonly depuis?: Date
  readonly signal?: AbortSignal
}

/**
 * Tout est OBLIGATOIRE. Un champ optionnel serait un champ qu'un connecteur
 * omettrait, et le moteur devrait alors deviner — c'est-à-dire supposer.
 */
export type Connecteur = {
  readonly id: string
  readonly palier: Palier
  /** Codes ISO 3166-1 alpha-2, ou `'monde'` pour une source sans frontière. */
  readonly pays: readonly string[] | 'monde'
  /** Secteurs couverts, ou `'tous'`. Ce qui rend le palier B crédible. */
  readonly secteurs: readonly string[] | 'tous'
  /** Délai typique entre publication réelle et disponibilité, en secondes. */
  readonly latenceAttendueSecondes: number
  readonly regime: RegimeAcces
  /** Plafond que le moteur ne dépassera jamais, quoi qu'il arrive. */
  readonly cadenceMaxParMinute: number
  /**
   * L'attribution que la source EXIGE d'afficher, ou `null`.
   *
   * Ce champ existe parce que certaines conditions d'utilisation la rendent
   * obligatoire — Remotive, par exemple, coupe l'accès sans elle. Une
   * obligation légale portée par la mémoire de quelqu'un est une obligation
   * qu'on oubliera au troisième écran ; portée par le contrat, l'interface
   * peut la lire et l'afficher sans avoir à la connaître.
   */
  readonly attribution: string | null
  readonly recolter: (ctx: ContexteRecolte) => Promise<Recolte>
}

export class ContratInvalide extends Error {
  readonly problemes: readonly string[]

  constructor(id: string, problemes: readonly string[]) {
    super(`Connecteur « ${id} » invalide :\n${problemes.map((p) => `  - ${p}`).join('\n')}`)
    this.problemes = problemes
    this.name = 'ContratInvalide'
  }
}

const ISO_PAYS = /^[A-Z]{2}$/

/**
 * Vérifie qu'un connecteur est utilisable AVANT qu'il entre dans le registre.
 * Un connecteur mal déclaré découvert en production, c'est une source qu'on
 * croyait couvrir et qui ne couvrait rien.
 */
export function valider(c: Connecteur): readonly string[] {
  const p: string[] = []

  if (!/^[a-z0-9-]{2,40}$/.test(c.id)) p.push('id : minuscules, chiffres et tirets, 2 à 40 caractères')
  if (!['a', 'b', 'c'].includes(c.palier)) p.push('palier : a, b ou c')

  if (c.pays !== 'monde') {
    if (c.pays.length === 0) p.push("pays : liste vide — employez 'monde' si la source est sans frontière")
    for (const code of c.pays) if (!ISO_PAYS.test(code)) p.push(`pays : « ${code} » n'est pas un code ISO 3166-1 alpha-2`)
  }
  if (c.secteurs !== 'tous' && c.secteurs.length === 0) {
    p.push("secteurs : liste vide — employez 'tous' si la source ne se limite pas")
  }

  if (!Number.isFinite(c.latenceAttendueSecondes) || c.latenceAttendueSecondes < 0) {
    p.push('latenceAttendueSecondes : nombre positif obligatoire — le palier affiché en dépend')
  }
  if (!Number.isInteger(c.cadenceMaxParMinute) || c.cadenceMaxParMinute <= 0) {
    p.push('cadenceMaxParMinute : entier strictement positif')
  }
  if (c.attribution !== null && c.attribution.trim() === '') {
    p.push("attribution : employez null si la source n'en exige pas — une chaîne vide se lit comme un oubli")
  }

  // Cohérence palier / latence : c'est ici qu'on empêche une source lente de
  // se présenter comme du palier A, ce qui reviendrait à mentir sur la seule
  // promesse défendable du produit.
  if (c.palier === 'a' && c.latenceAttendueSecondes > 300) {
    p.push('palier a : réservé aux sources relevées en 5 min ou moins')
  }
  if (c.palier === 'b' && c.latenceAttendueSecondes <= 300) {
    p.push('palier b : une source aussi rapide doit être déclarée en palier a')
  }
  // Un palier C ne postule pas : lui donner une cadence de collecte serait
  // déclarer une automatisation que ses conditions interdisent.
  if (c.palier === 'c' && c.regime !== 'assiste-uniquement') {
    p.push("palier c : le régime doit être 'assiste-uniquement'")
  }
  if (c.regime === 'assiste-uniquement' && c.palier !== 'c') {
    p.push("régime 'assiste-uniquement' : la source appartient au palier c")
  }

  return p
}

export function assertValide(c: Connecteur): void {
  const problemes = valider(c)
  if (problemes.length > 0) throw new ContratInvalide(c.id, problemes)
}
