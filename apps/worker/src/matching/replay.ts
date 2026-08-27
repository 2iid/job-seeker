/**
 * JOB-037 / REQ-005 — rejouer un score, et dire honnêtement ce qu'on rejoue.
 *
 * « Le calcul est reproductible : rejouer le score d'une candidature passée
 * redonne la même explication à partir des données conservées. »
 *
 * ── La difficulté que cette clause cache ──
 *
 * Un modèle n'est pas déterministe. Le rappeler avec les mêmes entrées rendrait
 * une explication VOISINE, pas identique — et un rejeu qui dit « ce n'est plus
 * la même » sans savoir pourquoi n'apprend rien à personne.
 *
 * Le score se sépare donc en deux moitiés, et le rejeu les traite
 * différemment :
 *
 *   LA MOITIÉ CALCULÉE — les rédhibitoires. Ils viennent du CODE (`JOB-035`),
 *   pas du modèle. Elle se RECALCULE, et une divergence est un fait dur : les
 *   règles ont changé depuis. C'est même la chose la plus utile que ce rejeu
 *   puisse trouver.
 *
 *   LA MOITIÉ JUGÉE — la valeur et les preuves. Elle ne se recalcule pas ; elle
 *   se CONSERVE. Ce qu'on peut vérifier, c'est qu'elle TIENT ENCORE : chaque
 *   citation figure-t-elle toujours mot pour mot dans le texte conservé de
 *   l'offre ?
 *
 * Un rejeu qui prétendrait tout recalculer mentirait. Un rejeu qui se
 * contenterait de relire ce qu'on a stocké ne vérifierait rien. Celui-ci fait
 * les deux et dit lequel est lequel.
 *
 * ── Pourquoi c'est utile en vrai ──
 *
 * Six mois plus tard, quelqu'un demande « pourquoi m'avez-vous proposé
 * celle-là ? ». La réponse honnête n'est pas « voici ce que je dirais
 * aujourd'hui » — c'est « voici ce que j'ai dit ce jour-là, et voici ce qui
 * tient encore ».
 */

import { citationPresente } from '@job-seeker/llm-guard'
import { evaluerRedhibitoires, type Criteres, type OffreAEvaluer, type Redhibitoire } from './redhibitoires.ts'
import type { ResumeScoring } from './resume.ts'

/** Tout ce qu'il faut conserver pour rejouer. Rien de plus, rien de moins. */
export type Instantane = {
  readonly opportuniteId: string
  readonly evalueLe: string
  /** Le texte de l'offre TEL QU'IL A ÉTÉ LU. Une annonce éditée depuis ne doit pas fausser le rejeu. */
  readonly texteOffre: string
  readonly offre: OffreAEvaluer
  readonly criteres: Criteres
  /** Le résumé envoyé au modèle — pas le profil complet (F19). */
  readonly resumeProfil: ResumeScoring
  readonly modele: string
  readonly score: {
    readonly valeur: number
    readonly correspondances: readonly { libelle: string; citation: string }[]
    readonly manques: readonly { libelle: string; citation: string }[]
    readonly redhibitoires: readonly Redhibitoire[]
    readonly citationsRejetees: number
  }
}

export type Divergence =
  | {
      readonly type: 'redhibitoire-apparu'
      readonly code: string
      readonly explication: string
    }
  | {
      readonly type: 'redhibitoire-disparu'
      readonly code: string
      readonly explication: string
    }
  | {
      readonly type: 'citation-introuvable'
      readonly libelle: string
      readonly citation: string
      readonly explication: string
    }

export type Rejeu = {
  /** Vrai quand l'explication conservée tient encore, entièrement. */
  readonly intacte: boolean
  readonly divergences: readonly Divergence[]
  /** Recalculés à partir des données conservées. */
  readonly redhibitoiresRecalcules: readonly Redhibitoire[]
  /**
   * Les preuves dont la citation figure ENCORE dans le texte conservé.
   * Ce n'est pas un recalcul : c'est une vérification de ce qu'on avait dit.
   */
  readonly preuvesQuiTiennent: number
  readonly preuvesTotal: number
}

export function rejouer(i: Instantane): Rejeu {
  const divergences: Divergence[] = []

  // ── La moitié CALCULÉE ──
  const recalcules = evaluerRedhibitoires(
    { ...i.offre, texteComplet: i.texteOffre },
    i.criteres,
  )
  const avant = new Set(i.score.redhibitoires.map((r) => r.code))
  const apres = new Set(recalcules.map((r) => r.code))

  for (const r of recalcules) {
    if (!avant.has(r.code)) {
      divergences.push({
        type: 'redhibitoire-apparu',
        code: r.code,
        explication:
          `Le rejeu trouve « ${r.code} » que l'évaluation d'origine n'avait pas. Les règles ont ` +
          'changé depuis, ou vos critères ont été modifiés. Cette offre ne serait plus proposée ' +
          'aujourd\'hui de la même façon.',
      })
    }
  }
  for (const r of i.score.redhibitoires) {
    if (!apres.has(r.code)) {
      divergences.push({
        type: 'redhibitoire-disparu',
        code: r.code,
        explication:
          `L'évaluation d'origine portait « ${r.code} », que le rejeu ne trouve plus. C'est le cas ` +
          'à regarder en premier : un rédhibitoire qui disparaît est une candidature qui pourrait ' +
          'désormais partir seule là où elle était bloquée.',
      })
    }
  }

  // ── La moitié JUGÉE ──
  const preuves = [...i.score.correspondances, ...i.score.manques]
  let tiennent = 0
  for (const p of preuves) {
    if (citationPresente(p.citation, i.texteOffre)) {
      tiennent += 1
    } else {
      divergences.push({
        type: 'citation-introuvable',
        libelle: p.libelle,
        citation: p.citation,
        explication:
          'Une citation conservée ne figure plus dans le texte conservé de l\'offre. Comme le texte ' +
          'ne bouge pas, cela veut dire que la vérification de citation a laissé passer quelque ' +
          'chose au moment de l\'évaluation.',
      })
    }
  }

  return {
    intacte: divergences.length === 0,
    divergences,
    redhibitoiresRecalcules: recalcules,
    preuvesQuiTiennent: tiennent,
    preuvesTotal: preuves.length,
  }
}

/**
 * Ce qu'on répond à « pourquoi m'avez-vous proposé celle-là ? ».
 *
 * La phrase distingue toujours les deux moitiés. Présenter le score conservé
 * comme s'il venait d'être recalculé laisserait croire à une garantie qu'on n'a
 * pas — et présenter le recalcul comme la seule vérité effacerait ce qui a
 * RÉELLEMENT été décidé ce jour-là.
 */
export function expliquerRejeu(i: Instantane, r: Rejeu): string {
  const date = i.evalueLe.slice(0, 10)
  const tete =
    `Le ${date}, j'ai noté cette offre ${i.score.valeur} sur 100, avec ${i.score.correspondances.length} ` +
    `correspondance(s) citées de l'annonce. C'est ce que j'ai dit ce jour-là — je ne le recalcule pas, ` +
    `parce qu'un modèle interrogé deux fois ne répond pas deux fois pareil.`

  if (r.intacte) {
    return (
      `${tete} Ce que je PEUX revérifier tient entièrement : les ${r.preuvesTotal} citation(s) figurent ` +
      'toujours dans l\'annonce que j\'avais lue, et les critères bloquants recalculés sont les mêmes.'
    )
  }
  return `${tete} Mais quelque chose a changé depuis :\n` +
    r.divergences.map((d) => `— ${d.explication}`).join('\n')
}
