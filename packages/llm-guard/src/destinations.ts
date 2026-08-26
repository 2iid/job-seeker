/**
 * JOB-052 — d'où vient une destination sortante.
 *
 * REQ-011 et REQ-016 posent la même règle, et c'est la plus importante du
 * produit : **aucune destination sortante ne provient du contenu récupéré ni de
 * la sortie du modèle.** Une URL de candidature ou une adresse de recruteur
 * vient d'une donnée vérifiée côté serveur, jamais d'un texte qu'un inconnu a
 * écrit et qu'un modèle a recopié.
 *
 * Sans cette règle, une annonce d'emploi peut faire partir la candidature de
 * quelqu'un — CV compris — vers l'adresse de son choix.
 */

export type Refus =
  | 'absente'
  | 'hors-registre'
  | 'schema-interdit'

export class DestinationRefusee extends Error {
  readonly motif: Refus
  constructor(motif: Refus, detail: string) {
    super(`Destination refusée (${motif}) : ${detail}`)
    this.name = 'DestinationRefusee'
    this.motif = motif
  }
}

/**
 * Vérifie qu'une URL sortante figure bien parmi celles que le SERVEUR connaît.
 *
 * La comparaison porte sur l'URL exacte, pas sur le domaine : autoriser un
 * domaine laisserait passer n'importe quel chemin de ce domaine, y compris une
 * page de redirection.
 */
export function urlAutorisee(candidate: string, connuesDuServeur: readonly string[]): string {
  if (candidate.trim() === '') throw new DestinationRefusee('absente', 'chaîne vide')
  let u: URL
  try {
    u = new URL(candidate)
  } catch {
    throw new DestinationRefusee('schema-interdit', 'URL illisible')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new DestinationRefusee('schema-interdit', u.protocol)
  }
  const normalisee = u.toString()
  if (!connuesDuServeur.some((c) => normaliser(c) === normalisee)) {
    throw new DestinationRefusee('hors-registre', "cette URL ne vient pas de nos données")
  }
  return normalisee
}

function normaliser(u: string): string {
  try {
    return new URL(u).toString()
  } catch {
    return u
  }
}

/**
 * Idem pour une adresse email. Le modèle peut RÉDIGER un message ; il ne
 * choisit jamais à qui il part.
 */
export function adresseAutorisee(candidate: string, connuesDuServeur: readonly string[]): string {
  const a = candidate.trim().toLowerCase()
  if (a === '') throw new DestinationRefusee('absente', 'chaîne vide')
  if (!connuesDuServeur.some((c) => c.trim().toLowerCase() === a)) {
    throw new DestinationRefusee('hors-registre', "cette adresse ne vient pas de nos données")
  }
  return a
}

/**
 * Le garde-fou de dernier recours : une sortie de modèle ne devient JAMAIS une
 * action directement. On y cherche une destination, et si elle ne figure pas
 * dans ce que le serveur connaît, on refuse — plutôt que de « corriger ».
 */
export function extraireDestinationSure(
  sortieModele: string,
  connuesDuServeur: readonly string[],
): string {
  const urls = sortieModele.match(/https?:\/\/[^\s<>"')]+/gi) ?? []
  for (const u of urls) {
    try {
      return urlAutorisee(u, connuesDuServeur)
    } catch {
      // On continue : une URL non reconnue dans une sortie de modèle est
      // exactement ce à quoi il faut s'attendre quand une injection a réussi.
    }
  }
  throw new DestinationRefusee(
    'hors-registre',
    "aucune destination connue du serveur dans la sortie du modèle",
  )
}
