/**
 * JOB-046 / JOB-047 / JOB-053 — la décision d'envoyer, en un seul endroit.
 *
 * Cinq conditions, et l'ordre dans lequel elles sont vérifiées est le message
 * rendu à la personne. On ne dit pas « votre quota est atteint » à quelqu'un
 * qui vient d'appuyer sur l'arrêt d'urgence : ce serait lui parler d'un
 * problème qu'il n'a pas, à propos d'une machine qu'il croit arrêtée.
 *
 *   1. ARRÊT D'URGENCE      — rien ne passe, sans négociation.
 *   2. PARCOURS D'ENTRÉE    — non terminé, rien ne sort (JOB-081).
 *   3. CRAN DU CANAL        — en dessous d'« agir-seul », on prépare, on n'envoie pas.
 *   4. MANDAT               — REQ-009 : valide À L'INSTANT DE L'EXÉCUTION.
 *   5. QUOTA ET PLAGE       — combien, et à quelles heures.
 *
 * ── « Vérifié au moment de l'exécution, pas seulement à la mise en file » ──
 *
 * REQ-009 le dit explicitement, et c'est la clause qui change l'architecture.
 * Entre la mise en file et l'envoi, il peut s'écouler des heures : le mandat
 * peut avoir expiré, la personne peut avoir tout arrêté, le quota du jour peut
 * avoir été consommé par une autre candidature. Une décision prise à la mise
 * en file et jamais reconsidérée enverrait dans un monde qui n'existe plus.
 *
 * ── Le quota met en file, il ne jette pas ──
 *
 * REQ-009 encore. Un quota atteint est une limite de rythme, pas un refus de
 * la candidature : la jeter reviendrait à punir quelqu'un d'avoir trouvé trop
 * d'offres le même jour.
 */

import type { Cran } from './autonomie.ts'

export type Canal = 'ats' | 'email' | 'formulaire'

export type Mandat = {
  readonly canal: Canal
  readonly cran: Cran
  readonly accordeLe: string
  readonly expireLe: string | null
  readonly revoqueLe: string | null
  readonly apercuEmpreinte: string | null
}

export type EtatEnvoi = {
  /**
   * Non nul quand la personne a demandé la suppression de son compte.
   *
   * Vérifié AVANT tout le reste, même avant l'arrêt d'urgence. Une suppression
   * n'est pas atomique : entre « elle a cliqué » et « les données sont
   * parties » il s'écoule des secondes, parfois plus si le worker est chargé.
   * Sans cet état, un travail déjà en file part pendant cette fenêtre — et les
   * données qui prouvaient ce qui est parti sont effacées juste après. La
   * personne ne saurait jamais qu'une candidature est partie en son nom APRÈS
   * qu'elle a demandé à tout effacer.
   */
  readonly suppressionDemandeeLe: string | null
  readonly arretUrgenceLe: string | null
  readonly parcoursTermineLe: string | null
  readonly cranDuCanal: Cran
  readonly mandats: readonly Mandat[]
  readonly quotaQuotidien: number
  readonly envoyesAujourdHui: number
  readonly plageDebutMinutes: number
  readonly plageFinMinutes: number
  /** Minutes depuis minuit DANS LE FUSEAU DU CANDIDAT. */
  readonly minutesLocales: number
}

export type MotifBlocage =
  | 'suppression-en-cours'
  | 'arret-urgence'
  | 'parcours-en-cours'
  | 'cran-insuffisant'
  | 'mandat-absent'
  | 'mandat-expire'
  | 'mandat-revoque'
  | 'quota-atteint'
  | 'hors-plage'

export type DecisionEnvoi =
  | { readonly envoyer: true; readonly mandat: Mandat }
  | {
      readonly envoyer: false
      readonly motif: MotifBlocage
      /** Vrai quand la candidature doit ATTENDRE plutôt qu'être abandonnée. */
      readonly enFile: boolean
      readonly explication: string
    }

/**
 * Le mandat en vigueur pour un canal, à un instant donné.
 *
 * Le plus RÉCEMMENT accordé l'emporte : la table est en insertion seule, et
 * révoquer consiste à écrire une nouvelle ligne. Prendre le premier trouvé
 * rendrait la révocation inopérante.
 */
export function mandatCourant(
  mandats: readonly Mandat[],
  canal: Canal,
  maintenant: Date,
): Mandat | undefined {
  return [...mandats]
    .filter((m) => m.canal === canal)
    // Un mandat daté du futur n'est pas encore en vigueur. Le cas paraît
    // théorique jusqu'au jour où une horloge dérive ou qu'un import de données
    // pose une date en avance — et il vaudrait alors autorisation.
    .filter((m) => new Date(m.accordeLe).getTime() <= maintenant.getTime())
    .sort((a, b) => new Date(b.accordeLe).getTime() - new Date(a.accordeLe).getTime())[0]
}

function dansLaPlage(e: EtatEnvoi): boolean {
  // Une plage qui franchit minuit (22 h → 6 h) est légitime : quelqu'un peut
  // vouloir que l'agent travaille la nuit, dans un autre fuseau que le sien.
  if (e.plageDebutMinutes <= e.plageFinMinutes) {
    return e.minutesLocales >= e.plageDebutMinutes && e.minutesLocales < e.plageFinMinutes
  }
  return e.minutesLocales >= e.plageDebutMinutes || e.minutesLocales < e.plageFinMinutes
}

export function peutEnvoyer(
  e: EtatEnvoi,
  canal: Canal,
  maintenant: Date = new Date(),
): DecisionEnvoi {
  const refus = (motif: MotifBlocage, enFile: boolean, explication: string): DecisionEnvoi => ({
    envoyer: false, motif, enFile, explication,
  })

  if (e.suppressionDemandeeLe !== null) {
    // En PREMIER, avant même l'arrêt d'urgence. Quelqu'un qui a demandé
    // l'effacement de son compte n'a pas à lire un message sur autre chose.
    return refus(
      'suppression-en-cours', false,
      'Vous avez demandé la suppression de votre compte. Plus rien ne part — et rien ne repartira, ' +
      'même si vous annulez : il faudra me le redemander explicitement.',
    )
  }

  if (e.arretUrgenceLe !== null) {
    // Sans négociation, et en premier : quelqu'un qui vient d'appuyer sur
    // l'arrêt ne doit pas lire un message sur son quota.
    return refus(
      'arret-urgence', false,
      'Vous avez tout arrêté. Rien ne repartira tant que vous ne me l’aurez pas demandé explicitement.',
    )
  }

  if (e.parcoursTermineLe === null) {
    return refus('parcours-en-cours', false, 'Votre installation n’est pas terminée.')
  }

  if (e.cranDuCanal !== 'agir-seul') {
    return refus(
      'cran-insuffisant', false,
      'Sur ce canal, votre cadran dit que je prépare et que vous envoyez.',
    )
  }

  const m = mandatCourant(e.mandats, canal, maintenant)
  if (m === undefined || m.cran !== 'agir-seul') {
    return refus(
      'mandat-absent', false,
      'Agir seule sur ce canal demande un mandat signé, précédé d’un aperçu de ce qui partira.',
    )
  }
  if (m.revoqueLe !== null && new Date(m.revoqueLe).getTime() <= maintenant.getTime()) {
    return refus('mandat-revoque', false, 'Vous avez retiré le mandat sur ce canal.')
  }
  if (m.expireLe !== null && new Date(m.expireLe).getTime() <= maintenant.getTime()) {
    // Une échéance existe pour être atteinte : un mandat sans fin est un
    // mandat qu'on oublie d'avoir donné.
    return refus(
      'mandat-expire', false,
      'Votre mandat sur ce canal est arrivé à échéance. Renouvelez-le et je reprends.',
    )
  }

  if (e.envoyesAujourdHui >= e.quotaQuotidien) {
    // EN FILE, pas jeté : un quota atteint est une limite de rythme, pas un
    // refus de la candidature. La jeter punirait quelqu'un d'avoir trouvé
    // trop d'offres le même jour.
    return refus(
      'quota-atteint', true,
      `Votre plafond de ${e.quotaQuotidien} envois par jour est atteint. Celle-ci part demain, elle n’est pas perdue.`,
    )
  }

  if (!dansLaPlage(e)) {
    return refus(
      'hors-plage', true,
      'Nous sommes hors de vos plages horaires. Celle-ci attend la prochaine ouverture.',
    )
  }

  return { envoyer: true, mandat: m }
}

/** Les minutes depuis minuit dans un fuseau donné — ce que `peutEnvoyer` attend. */
export function minutesLocales(instant: Date, fuseau: string): number {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: fuseau, hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const [h, min] = f.format(instant).split(':').map(Number)
  return (h ?? 0) * 60 + (min ?? 0)
}
