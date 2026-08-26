/**
 * Le langage de statut.
 *
 * La règle G5 du système : **aucun statut n'est porté par la couleur seule**.
 * Ce fichier rend la règle impossible à enfreindre par oubli — un statut est un
 * triplet {forme, libellé, ton}, et il n'existe pas d'objet statut sans les
 * trois. Retirez la couleur : la forme et le libellé portent encore le sens.
 *
 * ── Pourquoi des CLÉS et non des mots ──
 *
 * Ce fichier portait ses libellés en français, en dur. C'était la duplication
 * qui allait arriver : les mêmes phrases existent dans `@job-seeker/i18n`, et
 * deux exemplaires d'un libellé divergent toujours — l'un est corrigé, l'autre
 * pas, et quelqu'un lit deux mots différents pour la même chose selon l'écran.
 *
 * Il garde donc la STRUCTURE — la forme, le ton, le nombre de barres — et
 * délègue les MOTS. Un composant reçoit un traducteur ; le statut ne sait plus
 * dire son nom tout seul, et c'est voulu : il n'a jamais eu à le savoir.
 */

import type { Cle } from '@job-seeker/i18n'
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
  readonly labelKey: Cle
  /** Ce que ça veut dire pour l'utilisateur — la microcopie de l'infobulle. */
  readonly meaningKey: Cle
  readonly tone: TokenName
}

export const STATUSES = {
  detectee: {
    shape: 'cercle-creux',
    labelKey: 'statut.detectee', meaningKey: 'statut.detectee.sens',
    tone: 'text-muted',
  },
  'en-file': {
    shape: 'losange-plein',
    labelKey: 'statut.en-file', meaningKey: 'statut.en-file.sens',
    tone: 'accent-attente',
  },
  escalade: {
    shape: 'triangle',
    labelKey: 'statut.escalade', meaningKey: 'statut.escalade.sens',
    tone: 'accent-attente',
  },
  envoyee: {
    shape: 'carre-plein',
    labelKey: 'statut.envoyee', meaningKey: 'statut.envoyee.sens',
    tone: 'accent-machine',
  },
  consultee: {
    shape: 'coche',
    labelKey: 'statut.consultee', meaningKey: 'statut.consultee.sens',
    tone: 'accent-machine',
  },
  entretien: {
    shape: 'carre-epais-creux',
    labelKey: 'statut.entretien', meaningKey: 'statut.entretien.sens',
    tone: 'accent-machine',
  },
  'sans-reponse': {
    shape: 'tiret',
    labelKey: 'statut.sans-reponse', meaningKey: 'statut.sans-reponse.sens',
    tone: 'text-muted',
  },
  'echec-technique': {
    shape: 'croix',
    labelKey: 'statut.echec-technique', meaningKey: 'statut.echec-technique.sens',
    tone: 'accent-critique',
  },
} as const satisfies Record<string, Status>

export type StatusName = keyof typeof STATUSES

/** Les trois paliers de veille (ADR-0002), avec ce qu'on a le droit de promettre. */
export const TIERS = {
  a: {
    bars: 4, tone: 'accent-machine' as TokenName,
    labelKey: 'palier.a' as Cle, cadenceKey: 'palier.a.releve' as Cle, promiseKey: 'palier.a.promesse' as Cle,
  },
  b: {
    bars: 2, tone: 'text-secondary' as TokenName,
    labelKey: 'palier.b' as Cle, cadenceKey: 'palier.b.releve' as Cle, promiseKey: 'palier.b.promesse' as Cle,
  },
  c: {
    bars: 1, tone: 'text-muted' as TokenName,
    labelKey: 'palier.c' as Cle, cadenceKey: 'palier.c.releve' as Cle, promiseKey: 'palier.c.promesse' as Cle,
  },
} as const

export type TierName = keyof typeof TIERS
