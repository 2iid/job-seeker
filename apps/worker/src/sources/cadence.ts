import { type EtatSource, couvertureAffirmable } from './contract.ts'

/**
 * JOB-028 — la cadence, le retrait progressif, et l'état par source.
 *
 * Trois responsabilités qui vont ensemble parce qu'elles répondent à la même
 * question : « ai-je le droit d'interroger cette source maintenant, et si non,
 * qu'est-ce que j'ai le droit d'en dire ? »
 *
 * Aucun `setTimeout` ici. L'horloge est injectée, donc tout est testable sans
 * attendre — un test de retrait progressif qui dort vraiment ne serait jamais
 * exécuté assez souvent pour attraper une régression.
 */

type EtatDomaine = {
  /** Horodatages des appels récents, pour la fenêtre glissante d'une minute. */
  appels: number[]
  /** Tant que ce n'est pas dépassé, on ne touche plus à ce domaine. */
  penaliteJusqua: number
  /** Nombre de refus consécutifs — c'est lui qui fait croître l'attente. */
  refusConsecutifs: number
}

export type Decision =
  | { readonly autorise: true }
  | { readonly autorise: false; readonly attendreMs: number; readonly motif: 'cadence' | 'penalite' }

const PENALITE_MAX_MS = 15 * 60_000

export class Cadence {
  readonly #domaines = new Map<string, EtatDomaine>()
  readonly #horloge: () => number

  constructor(horloge: () => number = () => Date.now()) {
    this.#horloge = horloge
  }

  #etat(domaine: string): EtatDomaine {
    const e = this.#domaines.get(domaine) ?? { appels: [], penaliteJusqua: 0, refusConsecutifs: 0 }
    this.#domaines.set(domaine, e)
    return e
  }

  /**
   * Le plafond déclaré par le connecteur n'est jamais dépassé, quoi qu'il
   * arrive : c'est la promesse qu'on fait à la source, et la faire sauter une
   * fois suffit à se faire bloquer durablement.
   */
  demander(domaine: string, maxParMinute: number): Decision {
    const t = this.#horloge()
    const e = this.#etat(domaine)

    if (t < e.penaliteJusqua) {
      return { autorise: false, attendreMs: e.penaliteJusqua - t, motif: 'penalite' }
    }

    e.appels = e.appels.filter((a) => t - a < 60_000)
    if (e.appels.length >= maxParMinute) {
      const plusAncien = e.appels[0] ?? t
      return { autorise: false, attendreMs: 60_000 - (t - plusAncien), motif: 'cadence' }
    }

    e.appels.push(t)
    return { autorise: true }
  }

  /**
   * La source a dit non. L'attente double à chaque refus consécutif, et un
   * `Retry-After` explicite l'emporte toujours : quand une source nous dit
   * combien de temps attendre, insister est une faute, pas de l'optimisme.
   */
  refuse(domaine: string, retryAfterSecondes?: number): number {
    const e = this.#etat(domaine)
    e.refusConsecutifs += 1
    const calculee = Math.min(2 ** e.refusConsecutifs * 1000, PENALITE_MAX_MS)
    const attente =
      retryAfterSecondes !== undefined && retryAfterSecondes > 0
        ? retryAfterSecondes * 1000
        : calculee
    e.penaliteJusqua = this.#horloge() + attente
    return attente
  }

  /** Un succès efface la pénalité : on ne punit pas une source qui va bien. */
  reussit(domaine: string): void {
    const e = this.#etat(domaine)
    e.refusConsecutifs = 0
    e.penaliteJusqua = 0
  }
}

// ---------------------------------------------------------------------------
//  L'état par source, daté.
// ---------------------------------------------------------------------------

export type ObservationSource = {
  readonly source: string
  readonly etat: EtatSource
  readonly depuis: number
  readonly derniereReussite: number | null
}

/**
 * Retient depuis QUAND une source est dans son état.
 *
 * « Ashby indisponible » ne dit rien ; « Ashby indisponible depuis 11:40 » dit
 * à l'utilisateur ce qu'il a le droit de conclure de l'absence d'offres — et
 * l'écran ne peut le dire que si quelqu'un l'a noté.
 */
export class EtatDesSources {
  readonly #observations = new Map<string, ObservationSource>()
  readonly #horloge: () => number

  constructor(horloge: () => number = () => Date.now()) {
    this.#horloge = horloge
  }

  noter(source: string, etat: EtatSource): void {
    const t = this.#horloge()
    const precedent = this.#observations.get(source)
    this.#observations.set(source, {
      source,
      etat,
      // `depuis` ne bouge PAS tant que l'état ne change pas : c'est la durée
      // de la panne qui intéresse, pas la date du dernier essai.
      depuis: precedent !== undefined && precedent.etat === etat ? precedent.depuis : t,
      derniereReussite: couvertureAffirmable(etat) ? t : (precedent?.derniereReussite ?? null),
    })
  }

  observation(source: string): ObservationSource | null {
    return this.#observations.get(source) ?? null
  }

  /** Les sources dont on ne sait rien — celles qui interdisent de conclure. */
  aveugles(): readonly ObservationSource[] {
    return [...this.#observations.values()].filter((o) => !couvertureAffirmable(o.etat))
  }

  /**
   * La phrase que l'interface affiche. Elle nomme la source, son état et
   * DEPUIS QUAND, et se termine par ce que ça n'implique pas.
   */
  formuler(source: string): string | null {
    const o = this.#observations.get(source)
    if (o === null || o === undefined || couvertureAffirmable(o.etat)) return null
    const minutes = Math.floor((this.#horloge() - o.depuis) / 60_000)
    const duree = minutes < 1 ? "à l'instant" : minutes < 60 ? `depuis ${minutes} min` : `depuis ${Math.floor(minutes / 60)} h`
    return `${source} : ${o.etat} ${duree}. Ce n'est pas une absence d'offres.`
  }
}
