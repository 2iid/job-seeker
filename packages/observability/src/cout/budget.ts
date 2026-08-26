/**
 * JOB-072 — ce qu'une candidature a le droit de coûter.
 *
 * Un plafond qui AVERTIT n'est pas un plafond. Le mode d'échec de ce produit
 * n'est pas une dépense visible : c'est une boucle qui rappelle un modèle sur
 * une offre dont la sortie est illisible, trente fois, la nuit, sur un compte
 * qui ne regarde pas. La dépense se découvre à la facture, quand elle est déjà
 * faite.
 *
 * D'où un compteur qui REFUSE. `autoriser()` rend faux, l'appel n'a pas lieu,
 * et l'utilisateur voit une candidature en escalade plutôt qu'une facture.
 * Une escalade se rattrape ; un mois de dépense, non.
 *
 * ── Pourquoi le compteur est par CANDIDATURE ──
 *
 * Un plafond global protégerait le compte et laisserait une seule candidature
 * consommer la journée de tout le monde. Un plafond par candidature borne le
 * pire cas d'UNE unité de travail, ce qui est la seule borne qu'on puisse
 * expliquer à quelqu'un : « préparer une candidature coûte au plus tant ».
 */

import { coutEur } from './tarifs.ts'

/**
 * Plafond par candidature, en euros — CALCULÉ, pas estimé.
 *
 * La première version de cette constante valait 0,20 €, posée « avec de la
 * marge ». Le test l'a démentie : une candidature complète en coûte **0,22**.
 * Le plafond aurait donc bloqué le travail normal, ce qui est le pire type de
 * plafond — celui qui transforme un fonctionnement correct en incident.
 *
 * L'arithmétique, aux tarifs de `tarifs.ts` (4,60 € / 23 € par million) :
 *
 *   lecture du CV        1 300 entrée · 1 300 sortie  →  0,036 €  (mesuré)
 *   score d'une offre    3 000 · 1 500                →  0,048 €
 *   CV adapté            4 000 · 3 000                →  0,087 €
 *   lettre               3 000 · 1 500                →  0,048 €
 *                                                    ─────────
 *                                          une candidature ≈ 0,22 €
 *
 * Le plafond est fixé à **trois fois** ce montant : il laisse passer une
 * candidature difficile et ses reprises, et arrête celle qui boucle. Deux
 * conséquences à garder en tête, et à relire quand les tarifs bougent :
 *
 * · À 0,22 € l'unité, cent candidatures par mois coûtent **22 € de modèle par
 *   utilisateur**. C'est un fait de tarification, pas un détail technique — il
 *   appartient au dossier de `JOB-070`.
 * · Ce plafond descendra quand la chaîne sera optimisée. Le baisser sans
 *   remesurer reproduirait exactement l'erreur ci-dessus.
 */
export const CANDIDATURE_NOMINALE_EUR = 0.22
export const PLAFOND_CANDIDATURE_EUR = 0.75

export type Depense = {
  readonly modele: string
  readonly tokensEntree: number
  readonly tokensSortie: number
  /** `null` quand le modèle n'a pas de tarif connu. */
  readonly eur: number | null
}

export type EtatBudget = {
  readonly candidatureId: string
  readonly depenseEur: number
  readonly plafondEur: number
  readonly appels: number
  /** Appels dont le coût n'a PAS pu être établi. Comptés, jamais ignorés. */
  readonly appelsSansTarif: number
}

export type Compteur = {
  /** Faux quand le plafond est atteint : l'appel ne doit pas avoir lieu. */
  autoriser: () => boolean
  /** Enregistre un appel effectué et rend son coût. */
  imputer: (modele: string, tokensEntree: number, tokensSortie: number) => Depense
  etat: () => EtatBudget
}

export function creerCompteur(
  candidatureId: string,
  options: { plafondEur?: number; maintenant?: () => Date } = {},
): Compteur {
  const plafondEur = options.plafondEur ?? PLAFOND_CANDIDATURE_EUR
  const maintenant = options.maintenant ?? (() => new Date())
  let depenseEur = 0
  let appels = 0
  let appelsSansTarif = 0

  return {
    autoriser: () => depenseEur < plafondEur,

    imputer(modele, tokensEntree, tokensSortie) {
      appels += 1
      const eur = coutEur(modele, tokensEntree, tokensSortie, maintenant())
      if (eur === null) {
        // Un modèle sans tarif ne se facture pas au prix d'un autre : la
        // facture aurait l'air juste et serait fausse. On compte l'appel
        // séparément pour que l'écart se voie.
        appelsSansTarif += 1
      } else {
        depenseEur += eur
      }
      return { modele, tokensEntree, tokensSortie, eur }
    },

    etat: () => ({ candidatureId, depenseEur, plafondEur, appels, appelsSansTarif }),
  }
}

export class PlafondAtteint extends Error {
  readonly etat: EtatBudget
  constructor(etat: EtatBudget) {
    super(
      `Plafond de ${etat.plafondEur} EUR atteint pour la candidature ${etat.candidatureId} ` +
        `apres ${etat.appels} appel(s).`,
    )
    this.name = 'PlafondAtteint'
    this.etat = etat
  }
}
