/**
 * La couche de fournisseurs de modèle (JOB-035 et suivantes).
 *
 * Deux fournisseurs, une bascule, et une règle qui décide de tout :
 *
 *   ON NE BASCULE JAMAIS SUR UN REFUS.
 *
 * Si le modèle décline une demande, changer de fournisseur pour obtenir une
 * autre réponse serait du magasinage de complaisance, pas de la résilience. La
 * bascule existe pour les pannes — quota épuisé, crédit à zéro, serveur muet —
 * et pour rien d'autre. Cette distinction est dans le code, pas dans une note.
 */

export type Message = { readonly role: 'user' | 'assistant'; readonly content: string }

export type Demande = {
  readonly systeme: string
  readonly messages: readonly Message[]
  readonly maxTokens: number
  /** À quoi le coût est imputable. Un coût non attribuable ne sert à rien. */
  readonly imputableA: string
  readonly effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

export type Reponse = {
  readonly texte: string
  readonly fournisseur: string
  readonly modele: string
  readonly tokensEntree: number
  readonly tokensSortie: number
  /** Vrai quand le modèle a décliné. Ce n'est PAS une panne. */
  readonly refus: boolean
  readonly motifRefus?: string
}

/** Pourquoi un appel a échoué — c'est ce qui décide s'il faut basculer. */
export type Categorie =
  /** Quota, crédit épuisé, débit dépassé, panne serveur, réseau : BASCULE. */
  | 'panne'
  /** Demande invalide de notre côté : rejouer ailleurs brûlerait le second aussi. */
  | 'demande-invalide'
  /** Authentification refusée : la clé est mauvaise, l'autre fournisseur n'y peut rien. */
  | 'auth'

export class ErreurFournisseur extends Error {
  readonly categorie: Categorie
  readonly fournisseur: string
  readonly statut: number | undefined

  constructor(fournisseur: string, categorie: Categorie, message: string, statut?: number) {
    super(`${fournisseur} : ${message}`)
    this.name = 'ErreurFournisseur'
    this.fournisseur = fournisseur
    this.categorie = categorie
    this.statut = statut
  }
}

export function categoriser(statut: number | undefined): Categorie {
  if (statut === undefined) return 'panne' // réseau, délai : l'autre peut répondre
  if (statut === 401 || statut === 403) return 'auth'
  if (statut === 429) return 'panne'
  if (statut === 402) return 'panne' // crédit épuisé — exactement le cas visé
  if (statut >= 500) return 'panne'
  if (statut >= 400) return 'demande-invalide'
  return 'panne'
}

export type Fournisseur = {
  readonly nom: string
  readonly disponible: boolean
  readonly completer: (d: Demande) => Promise<Reponse>
}
