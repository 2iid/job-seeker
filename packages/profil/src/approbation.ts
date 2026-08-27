/**
 * JOB-048 / REQ-010 — la file d'approbation, et ce qui la fait sortir.
 *
 * ── Le mode d'échec qu'on prévient ──
 *
 * Une file qui « rattrape son retard ». Quelqu'un s'absente une semaine,
 * revient, et l'agent envoie d'un coup douze candidatures — dont sept à des
 * offres fermées et cinq qui ne l'intéressent plus. Aucune des douze n'a été
 * décidée le jour où elle part.
 *
 * REQ-010 le dit sans détour : « un élément non traité avant l'expiration de
 * l'offre est archivé avec son motif, JAMAIS ENVOYÉ EN SILENCE APRÈS COUP ».
 *
 * ── Pourquoi le refus porte un motif choisi et non un texte libre ──
 *
 * Un champ libre obtient « non » dans quatre-vingts pour cent des cas, et
 * REQ-006 — apprendre des refus — n'a alors rien à lire. Une liste courte
 * s'exploite. Le champ libre existe quand même, EN PLUS, parce qu'un motif
 * imposé qui ne correspond à rien pousse à choisir n'importe lequel.
 */

export type MotifRefus =
  | 'salaire-insuffisant'
  | 'lieu'
  | 'employeur'
  | 'intitule-trompeur'
  | 'deja-postule'
  | 'plus-interesse'
  | 'document-inexact'
  | 'autre'

export const MOTIFS: readonly MotifRefus[] = [
  'salaire-insuffisant', 'lieu', 'employeur', 'intitule-trompeur',
  'deja-postule', 'plus-interesse', 'document-inexact', 'autre',
]

/** Ce que chaque motif veut dire, du point de vue de la personne. */
export const LIBELLE_MOTIF: Readonly<Record<MotifRefus, string>> = {
  'salaire-insuffisant': 'Le salaire ne va pas',
  lieu: 'Le lieu ne va pas',
  employeur: 'Pas cet employeur',
  'intitule-trompeur': 'L’intitulé ne correspond pas au poste décrit',
  'deja-postule': 'J’ai déjà postulé ailleurs chez eux',
  'plus-interesse': 'Je ne cherche plus ça',
  'document-inexact': 'Le CV ou la lettre disent quelque chose d’inexact',
  autre: 'Autre',
}

/**
 * Les motifs qui doivent CHANGER LA RECHERCHE, pas seulement écarter l'offre.
 *
 * C'est la moitié utile de REQ-006. Refuser trois fois pour « salaire » veut
 * dire que le seuil est mal réglé — pas que ces trois offres étaient mauvaises.
 * Un produit qui se contente d'écarter fait recommencer le même refus.
 */
export const MOTIFS_QUI_APPRENNENT: readonly MotifRefus[] = [
  'salaire-insuffisant', 'lieu', 'employeur', 'plus-interesse',
]

export type ElementFile = {
  readonly id: string
  readonly statut: string
  readonly expireLe: string | null
  readonly archiveeLe: string | null
}

export type Sortie =
  | { readonly action: 'garder' }
  | { readonly action: 'archiver'; readonly raison: string }

/**
 * Que faire d'un élément de file, à un instant donné.
 *
 * Un élément SANS échéance reste en file. Inventer une date serait pire que ne
 * pas en avoir : elle archiverait une offre encore ouverte, et la personne
 * découvrirait que le produit a décidé à sa place qu'il était trop tard.
 */
export function sortieDeFile(e: ElementFile, maintenant: Date): Sortie {
  if (e.archiveeLe !== null) return { action: 'garder' }
  if (e.expireLe === null) return { action: 'garder' }
  if (new Date(e.expireLe).getTime() > maintenant.getTime()) return { action: 'garder' }
  return {
    action: 'archiver',
    raison:
      'L’offre a expiré avant que vous ne décidiez. Je ne l’ai pas envoyée : une candidature qui part ' +
      'après la fermeture n’arrive nulle part, et une candidature que vous n’avez pas décidée ce ' +
      'jour-là n’est pas la vôtre.',
  }
}

/**
 * Filtre ce qui est RÉELLEMENT en attente de décision.
 *
 * Un élément expiré n'est pas « en attente » : le laisser dans la file lui
 * donnerait un bouton « approuver » qui n'aboutirait à rien, et faire cliquer
 * quelqu'un sur un bouton sans effet est une façon de lui mentir.
 */
export function enAttente(
  elements: readonly ElementFile[],
  maintenant: Date = new Date(),
): readonly ElementFile[] {
  return elements.filter(
    (e) => e.archiveeLe === null && sortieDeFile(e, maintenant).action === 'garder',
  )
}

/**
 * Ce qu'un lot de refus dit des critères.
 *
 * Rend les motifs répétés au moins `seuil` fois. En dessous, c'est du bruit :
 * proposer de changer un critère après un seul refus apprendrait au produit à
 * suivre l'humeur du jour.
 */
export function enseignements(
  motifs: readonly MotifRefus[],
  seuil = 3,
): readonly { motif: MotifRefus; occurrences: number }[] {
  const comptes = new Map<MotifRefus, number>()
  for (const m of motifs) {
    if (MOTIFS_QUI_APPRENNENT.includes(m)) comptes.set(m, (comptes.get(m) ?? 0) + 1)
  }
  return [...comptes]
    .filter(([, n]) => n >= seuil)
    .sort((a, b) => b[1] - a[1])
    .map(([motif, occurrences]) => ({ motif, occurrences }))
}
