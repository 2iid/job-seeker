/**
 * JOB-081 / REQ-009 — jusqu'où l'agent va, et quand il n'y va pas du tout.
 *
 * Les quatre crans se lisent comme une échelle de confiance, et le défaut est
 * « proposer ». Pas « observer », qui rendrait le produit inutile le premier
 * jour ; surtout pas « agir seul », qui prendrait une confiance qu'on n'a pas
 * donnée.
 *
 * ── La garde qui ne dépend d'aucun cran ──
 *
 * `parcoursTermineLe === null` interdit toute action sortante, même à
 * « agir-seul ». Ce n'est pas une redondance : le parcours d'entrée MONTRE le
 * cadran et laisse la personne le déplacer, parce que c'est là qu'elle
 * comprend ce qu'elle accorde. Elle le déplace pour APPRENDRE — et pendant ce
 * temps l'agent trouve déjà de vraies offres sous ses yeux. Sans cette garde,
 * un geste de curiosité enverrait une vraie candidature à un vrai recruteur.
 *
 * La règle vit ici, partagée par l'écran et le worker, pour la raison
 * habituelle : deux définitions de « le parcours est fini » divergeraient, et
 * c'est le worker qui aurait le dernier mot.
 */

export const CRANS = ['observer', 'proposer', 'agir-apres-accord', 'agir-seul'] as const
export type Cran = (typeof CRANS)[number]

/** Le cran proposé à quelqu'un qui n'a rien choisi. Jamais le plus permissif. */
export const CRAN_PAR_DEFAUT: Cran = 'proposer'

export type EtatAutonomie = {
  readonly cran: Cran
  /** `null` tant que le parcours d'entrée n'est pas terminé. */
  readonly parcoursTermineLe: string | null
  /** Un mandat horodaté est exigé pour « agir-seul » (REQ-009, JOB-046). */
  readonly mandatValide: boolean
}

export type Verdict =
  | { readonly autorise: true }
  | { readonly autorise: false; readonly motif: MotifRefus; readonly explication: string }

export type MotifRefus = 'parcours-en-cours' | 'cran-insuffisant' | 'mandat-absent'

/**
 * L'agent peut-il envoyer SEUL, sans nouvel accord ?
 *
 * Trois conditions, dans cet ordre, et l'ordre est le message : on ne dit
 * jamais « il vous manque un mandat » à quelqu'un qui n'a pas fini son
 * parcours — ce serait lui demander de résoudre un problème qu'il n'a pas
 * encore.
 */
export function peutAgirSeule(e: EtatAutonomie): Verdict {
  if (e.parcoursTermineLe === null) {
    return {
      autorise: false,
      motif: 'parcours-en-cours',
      explication:
        'Votre installation n’est pas terminée. Rien ne part tant que vous ne l’avez pas achevée, ' +
        'même si le cadran est au maximum — vous êtes en train de l’essayer, pas de m’autoriser.',
    }
  }
  if (e.cran !== 'agir-seul') {
    return {
      autorise: false,
      motif: 'cran-insuffisant',
      explication: 'Votre cadran est sur « ' + LIBELLES.fr[e.cran] + ' » : je prépare, vous envoyez.',
    }
  }
  if (!e.mandatValide) {
    return {
      autorise: false,
      motif: 'mandat-absent',
      explication:
        'Agir seule demande un mandat signé et horodaté, précédé d’un aperçu intégral de ce qui ' +
        'partira. Je ne l’ai pas.',
    }
  }
  return { autorise: true }
}

/**
 * L'agent peut-il PROPOSER une candidature préparée ?
 *
 * Même garde de parcours : proposer, c'est déjà préparer un CV et une lettre,
 * donc dépenser et écrire. Mais aucun mandat n'est requis — rien ne sort.
 */
export function peutProposer(e: EtatAutonomie): Verdict {
  if (e.parcoursTermineLe === null) {
    return {
      autorise: false,
      motif: 'parcours-en-cours',
      explication: 'Votre installation n’est pas terminée.',
    }
  }
  if (e.cran === 'observer') {
    return {
      autorise: false,
      motif: 'cran-insuffisant',
      explication: 'Votre cadran est sur « observer » : je vous montre ce que je trouve, sans rien préparer.',
    }
  }
  return { autorise: true }
}

export const LIBELLES: Record<'fr' | 'en', Record<Cran, string>> = {
  fr: {
    observer: 'Observer',
    proposer: 'Proposer',
    'agir-apres-accord': 'Agir après mon accord',
    'agir-seul': 'Agir seule',
  },
  en: {
    observer: 'Watch only',
    proposer: 'Propose',
    'agir-apres-accord': 'Act once I approve',
    'agir-seul': 'Act on its own',
  },
}

/** Ce que chaque cran veut dire concrètement, du point de vue de la personne. */
export const SENS: Record<'fr' | 'en', Record<Cran, string>> = {
  fr: {
    observer: 'Je cherche et je vous montre. Je ne prépare rien, je n’envoie rien.',
    proposer: 'Je prépare un dossier complet et je vous le soumets. Vous envoyez.',
    'agir-apres-accord': 'J’envoie moi-même, une fois que vous avez dit oui à chaque candidature.',
    'agir-seul': 'J’envoie sans vous demander à chaque fois. Demande un mandat signé.',
  },
  en: {
    observer: 'I search and show you. I prepare nothing and send nothing.',
    proposer: 'I prepare a full application and hand it to you. You send it.',
    'agir-apres-accord': 'I send it myself, once you have approved that application.',
    'agir-seul': 'I send without asking each time. Requires a signed mandate.',
  },
}
