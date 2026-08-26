/**
 * Afficher une rémunération — dans sa devise, et convertie si on peut.
 *
 * REQ-004 : « salaires affichés dans la devise de l'offre ET convertis dans
 * celle de l'utilisateur, la conversion étant identifiée comme telle avec sa
 * date de taux ».
 *
 * Les trois moitiés de cette phrase se tiennent ensemble.
 *
 * · **La devise de l'offre d'abord.** C'est le montant que l'employeur paiera.
 *   Un candidat qui négocie doit avoir sous les yeux le nombre qui figurera
 *   dans son contrat, pas notre traduction de ce nombre.
 *
 * · **La conversion identifiée COMME TELLE.** « ≈ 68 000 € » sans marque se
 *   lit comme une donnée de l'offre. Le jour où le taux bouge de dix pour
 *   cent, ce n'est pas notre affichage qu'on accusera d'avoir changé : c'est
 *   l'employeur d'avoir menti.
 *
 * · **Avec sa date.** Un taux sans date est un taux dont personne ne peut
 *   dire s'il vaut encore. Le nôtre vient d'un relevé, il vieillit, et le dire
 *   coûte six caractères.
 *
 * ── Quand il n'y a pas de taux ──
 *
 * On n'affiche PAS de conversion, et on ne la remplace pas par un « ≈ » posé
 * sur une valeur devinée. Un montant converti à un taux inconnu est une
 * information fausse présentée comme une aide.
 */

import type { Traducteur } from '@job-seeker/i18n'

export type MontantAffichable = {
  /** Unités mineures entières — la convention du projet pour toute somme. */
  readonly min: number | null
  readonly max: number | null
  readonly devise: string
  readonly periode: 'heure' | 'jour' | 'mois' | 'an' | null
}

export type Taux = {
  readonly vers: string
  readonly valeur: number
  /** Date du relevé, en ISO. Un taux sans date ne s'affiche pas. */
  readonly le: string
}

/** Devises sans sous-unité : y diviser par cent afficherait un centième du salaire. */
const SANS_SOUS_UNITE = new Set(['JPY', 'KRW', 'VND', 'XOF', 'XAF', 'CLP', 'ISK', 'PYG', 'RWF', 'UGX'])

export function exposant(devise: string): number {
  return SANS_SOUS_UNITE.has(devise.toUpperCase()) ? 0 : 2
}

function formaterNombre(unitesMineures: number, devise: string, locale: string): string {
  const e = exposant(devise)
  const valeur = unitesMineures / 10 ** e
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: devise,
    // Un salaire s'annonce en entier. « 45 000,00 € » ajoute deux chiffres qui
    // ne portent rien et volent la place dont le libellé a besoin à 390 px.
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(valeur)
}

const PERIODE_CLE = {
  heure: '/ h', jour: '/ j', mois: '/ mois', an: '/ an',
} as const

export type SalaireAffiche = {
  /** Le montant tel que l'employeur le paiera. Toujours présent. */
  readonly origine: string
  /** La conversion, ou `null` quand aucun taux n'est disponible. */
  readonly converti: string | null
  /** À afficher à côté de la conversion. `null` quand il n'y en a pas. */
  readonly mentionTaux: string | null
}

export function formaterSalaire(
  m: MontantAffichable,
  options: { locale?: string; taux?: Taux | null } = {},
): SalaireAffiche | null {
  if (m.min === null && m.max === null) return null
  const locale = options.locale ?? 'fr-FR'
  const suffixe = m.periode === null ? '' : ` ${PERIODE_CLE[m.periode]}`

  const rendre = (devise: string, facteur: number, expOrigine: number): string => {
    const ajuste = (v: number): number => {
      // Le passage d'une devise à sous-unité vers une devise sans (et
      // l'inverse) change l'échelle des unités mineures : 4 500 000 centimes
      // d'euro ne sont pas 4 500 000 francs CFA. Sans ce réajustement, la
      // conversion se trompe d'un facteur cent — dans un sens ou dans l'autre
      // selon le couple de devises.
      const converti = v * facteur
      return Math.round(converti * 10 ** (exposant(devise) - expOrigine))
    }
    const bornes = [m.min, m.max].filter((v): v is number => v !== null).map(ajuste)
    const textes = [...new Set(bornes.map((v) => formaterNombre(v, devise, locale)))]
    return `${textes.join(' – ')}${suffixe}`
  }

  const expOrigine = exposant(m.devise)
  const origine = rendre(m.devise, 1, expOrigine)

  const taux = options.taux ?? null
  if (taux === null || taux.vers.toUpperCase() === m.devise.toUpperCase()) {
    return { origine, converti: null, mentionTaux: null }
  }

  return {
    origine,
    converti: `≈ ${rendre(taux.vers, taux.valeur, expOrigine)}`,
    // Le mot « taux » et la date, ensemble. Sans eux, la conversion se lit
    // comme une donnée de l'offre.
    mentionTaux: `taux du ${new Date(taux.le).toISOString().slice(0, 10)}`,
  }
}

/** Ce qu'on affiche quand l'offre ne dit pas de salaire. */
export function salaireInconnu(t: Traducteur): string {
  void t
  return '—'
}
