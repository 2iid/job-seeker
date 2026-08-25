/**
 * Le langage de statut.
 *
 * La règle G5 du système : **aucun statut n'est porté par la couleur seule**.
 * Ce fichier rend la règle impossible à enfreindre par oubli — un statut est un
 * triplet {forme, libellé, ton}, et il n'existe pas d'objet statut sans les
 * trois. Retirez la couleur : la forme et le libellé portent encore le sens.
 *
 * Les libellés sont écrits du point de vue du candidat, pas du système. « Sans
 * réponse » plutôt que « expiré » — un refus est une donnée du marché, jamais
 * l'échec de quelqu'un.
 */

import type { TokenName } from './tokens'

/** La forme est ce qui reste quand la couleur disparaît. Jamais deux fois la même. */
export type StatusShape =
  | 'cercle-creux'
  | 'losange-plein'
  | 'triangle'
  | 'carre-plein'
  | 'coche'
  | 'carre-epais-creux'
  | 'tiret'
  | 'croix'

export type Status = {
  readonly shape: StatusShape
  readonly label: string
  /** Ce que ça veut dire pour l'utilisateur — la microcopie de l'infobulle. */
  readonly meaning: string
  readonly tone: TokenName
}

export const STATUSES = {
  detectee: {
    shape: 'cercle-creux', label: 'Détectée',
    meaning: "Je l'ai vue, je ne l'ai pas encore jugée.",
    tone: 'text-muted',
  },
  'en-file': {
    shape: 'losange-plein', label: 'En file — votre accord',
    meaning: "Prête, rien n'est parti. J'attends.",
    tone: 'accent-attente',
  },
  escalade: {
    shape: 'triangle', label: 'Escalade — je rends la main',
    meaning: "Le formulaire m'a bloquée. Je vous dis où et pourquoi.",
    tone: 'accent-attente',
  },
  envoyee: {
    shape: 'carre-plein', label: 'Envoyée',
    meaning: 'Partie, avec un reçu horodaté.',
    tone: 'accent-machine',
  },
  consultee: {
    shape: 'coche', label: 'Consultée',
    meaning: 'Quelqu’un a ouvert votre dossier.',
    tone: 'accent-machine',
  },
  entretien: {
    shape: 'carre-epais-creux', label: 'Entretien',
    meaning: 'Un rendez-vous est pris. Je prépare le brief.',
    tone: 'accent-machine',
  },
  'sans-reponse': {
    shape: 'tiret', label: 'Sans réponse',
    meaning: "Le marché n'a pas répondu. Ce n'est pas votre échec.",
    tone: 'text-muted',
  },
  'echec-technique': {
    shape: 'croix', label: 'Échec technique',
    meaning: "L'envoi n'est pas passé. Voici quoi, pourquoi, et quoi faire.",
    tone: 'accent-critique',
  },
} as const satisfies Record<string, Status>

export type StatusName = keyof typeof STATUSES

/** Les trois paliers de veille (ADR-0002), avec ce qu'on a le droit de promettre. */
export const TIERS = {
  a: {
    bars: 4, tone: 'accent-machine' as TokenName,
    label: 'Palier A',
    cadence: "Board de l'entreprise, relevé toutes les 2 à 5 min.",
    promise: 'Vous êtes parmi les premiers dossiers.',
  },
  b: {
    bars: 2, tone: 'text-secondary' as TokenName,
    label: 'Palier B',
    cadence: 'Agrégateur ou portail public, relevé toutes les 15 à 60 min.',
    promise: "Publiée avant, je ne sais pas quand.",
  },
  c: {
    bars: 1, tone: 'text-muted' as TokenName,
    label: 'Palier C',
    cadence: 'Plateforme que je ne peux pas parcourir.',
    promise: 'Je vous assiste, je ne postule pas.',
  },
} as const

export type TierName = keyof typeof TIERS
