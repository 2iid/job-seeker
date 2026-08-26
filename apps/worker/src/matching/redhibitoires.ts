/**
 * REQ-005 — les critères rédhibitoires.
 *
 * Ils sont calculés PAR DU CODE, jamais demandés au modèle.
 *
 * C'est la décision structurante de ce module. Un rédhibitoire décidé par un
 * LLM n'est pas une garantie : il est probable, révisable, et il changera d'avis
 * un jour sur la même offre. Or ces critères sont exactement ceux dont dépend
 * la promesse « je ne postulerai pas seule » — autorisation de travail, langue,
 * zone, employeur exclu. Une candidature partie malgré un rédhibitoire n'est
 * pas une erreur d'appréciation : c'est une action irréversible faite au nom de
 * quelqu'un contre sa consigne explicite.
 *
 * Le modèle explique et cite. Le code décide.
 */

import { plateformeAssistee } from '../sources/assiste/registre.ts'

export type Criteres = {
  readonly zones: readonly string[]
  readonly autorisationTravail: readonly string[]
  readonly presence: readonly ('distanciel' | 'hybride' | 'presentiel')[]
  readonly motsRedhibitoires: readonly string[]
  readonly employeursExclus: readonly string[]
}

export type OffreAEvaluer = {
  readonly titre: string
  readonly employeurCanonique: string
  readonly lieu: string | null
  readonly pays: string | null
  readonly teletravailTexte: string | null
  readonly description: string | null
  /**
   * Le texte intégral de l'annonce, quand on l'a.
   *
   * `description` est ce que la source a bien voulu rendre dans sa liste :
   * souvent un résumé, parfois tronqué. `texteComplet` est ce que le MODÈLE
   * lira. Chercher un mot rédhibitoire dans le résumé pendant que le modèle
   * lit le tout laisserait passer exactement les offres qu'on cherche à
   * écarter — « astreintes de nuit » figure rarement dans le chapeau.
   */
  readonly texteComplet?: string | null
  /**
   * Le palier de la source (ADR-0002). `'c'` interdit toute candidature
   * automatique, quel que soit le score — c'est JOB-082, et c'est du CODE
   * plutôt qu'une consigne parce qu'une plateforme qu'on n'a pas le droit de
   * parcourir ne devient pas parcourable un jour où le modèle est confiant.
   */
  readonly palier?: 'a' | 'b' | 'c'
  /** L'URL de candidature, quand on l'a : elle peut désigner une plateforme assistée. */
  readonly urlCandidature?: string | null
}

export type Redhibitoire = {
  readonly code:
    | 'employeur-exclu'
    | 'hors-zone'
    | 'sans-autorisation'
    | 'presence-refusee'
    | 'mot-redhibitoire'
    /** JOB-082 — palier C : je vous assiste, je ne postule pas. */
    | 'plateforme-assistee'
  readonly explication: string
}

/**
 * ── EXCLUSION et RÉDHIBITOIRE ne sont pas la même chose ──
 *
 * REQ-002 emploie trois mots qui ne sont pas synonymes : une offre exclue
 * n'est « jamais présentée, jamais scorée, jamais soumise ».
 *
 * Une EXCLUSION est une consigne explicite de la personne : cet employeur,
 * jamais ; ce mot, jamais. Elle a demandé à ne PAS VOIR. Lui montrer l'offre
 * assortie d'une explication reviendrait à la lui montrer quand même, et la
 * scorer dépenserait un appel de modèle pour produire un texte que personne ne
 * doit lire.
 *
 * Un RÉDHIBITOIRE est un fait sur le monde : vous n'avez pas l'autorisation de
 * travailler là, l'offre exige une présence hors de vos zones. La personne n'a
 * jamais demandé à ne pas voir ces offres-là — et REQ-005 exige d'expliquer
 * POURQUOI une offre a été écartée. Se taire ne serait pas une protection,
 * seulement un silence, et elle ne pourrait pas corriger un critère trop
 * étroit qu'elle ne voit pas agir.
 *
 * Le code de l'exclusion est donc consulté AVANT tout appel de modèle.
 */
const CODES_EXCLUSION = new Set(['employeur-exclu', 'mot-redhibitoire'])

/**
 * L'offre a-t-elle été exclue par une consigne explicite ?
 *
 * Rend la première exclusion trouvée, ou `undefined`. À interroger avant de
 * scorer : ce qui est exclu ne se score pas.
 */
export function exclusion(bloquants: readonly Redhibitoire[]): Redhibitoire | undefined {
  return bloquants.find((b) => CODES_EXCLUSION.has(b.code))
}

const sansAccent = (v: string): string =>
  v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function presenceDeLOffre(o: OffreAEvaluer): 'distanciel' | 'hybride' | 'presentiel' | null {
  const t = sansAccent(`${o.teletravailTexte ?? ''} ${o.lieu ?? ''} ${o.description ?? ''}`)
  if (/\b(hybride|hybrid)\b/.test(t)) return 'hybride'
  if (/\b(distanciel|remote|teletravail|full remote|100% remote)\b/.test(t)) return 'distanciel'
  if (/\b(presentiel|on ?site|sur site|presence)\b/.test(t)) return 'presentiel'
  return null
}

/**
 * Renvoie les rédhibitoires déclenchés. Une liste vide signifie « rien ne
 * bloque » — pas « tout va bien » : le score, lui, est une autre question.
 */
export function evaluerRedhibitoires(o: OffreAEvaluer, c: Criteres): readonly Redhibitoire[] {
  const bloquants: Redhibitoire[] = []

  // ── Palier C : le seul rédhibitoire qui ne dépend PAS des critères ──
  //
  // Les autres décrivent un désaccord entre l'offre et ce que la personne a
  // demandé ; celui-ci décrit ce que NOUS n'avons pas le droit de faire. Il
  // ne se lève donc pas en changeant un critère, et il n'a pas à être
  // configurable — un cran d'autonomie poussé au maximum ne le franchit pas.
  //
  // Ce n'est pas une exclusion : l'offre EST présentée, on prépare le dossier,
  // et l'envoi reste le geste de la personne.
  const assistee = o.urlCandidature != null ? plateformeAssistee(o.urlCandidature) : undefined
  if (o.palier === 'c' || assistee !== undefined) {
    bloquants.push({
      code: 'plateforme-assistee',
      explication:
        assistee?.explication
        ?? 'Cette plateforme ne peut pas être parcourue automatiquement. Je vous prépare votre dossier, l\'envoi reste votre geste.',
    })
  }

  if (c.employeursExclus.some((e) => sansAccent(e) === sansAccent(o.employeurCanonique))) {
    bloquants.push({
      code: 'employeur-exclu',
      explication: 'Vous avez exclu cet employeur. Je ne vous présente pas cette offre.',
    })
  }

  // La zone n'est vérifiée que si l'offre exige une présence : une offre
  // 100 % distancielle dans un autre pays n'est pas hors zone.
  const presence = presenceDeLOffre(o)
  if (presence !== null && c.presence.length > 0 && !c.presence.includes(presence)) {
    bloquants.push({
      code: 'presence-refusee',
      explication: `Cette offre est en ${presence}, et vous ne cherchez pas ce mode de travail.`,
    })
  }

  if (presence !== null && presence !== 'distanciel' && c.zones.length > 0 && o.lieu !== null) {
    const dansUneZone = c.zones.some((z) => sansAccent(o.lieu ?? '').includes(sansAccent(z)))
    if (!dansUneZone) {
      bloquants.push({
        code: 'hors-zone',
        explication: `Une présence est demandée à ${o.lieu}, hors de vos zones.`,
      })
    }
  }

  // L'autorisation de travail est la plus dure : sans elle, la candidature est
  // perdue d'avance et fait perdre du temps à tout le monde.
  if (o.pays !== null && c.autorisationTravail.length > 0) {
    if (!c.autorisationTravail.map((p) => p.toUpperCase()).includes(o.pays.toUpperCase())) {
      bloquants.push({
        code: 'sans-autorisation',
        explication: `Travailler en ${o.pays} demande une démarche que vous n'avez pas déclarée.`,
      })
    }
  }

  // Le texte le plus complet dont on dispose, jamais le résumé quand on a
  // mieux : ce qu'on filtre doit être ce que le modèle aurait lu.
  const texte = sansAccent(`${o.titre} ${o.texteComplet ?? o.description ?? ''}`)
  for (const mot of c.motsRedhibitoires) {
    if (mot.trim() !== '' && texte.includes(sansAccent(mot))) {
      bloquants.push({
        code: 'mot-redhibitoire',
        explication: `L'offre mentionne « ${mot} », que vous avez marqué comme rédhibitoire. Je ne vous la présente pas.`,
      })
    }
  }

  return bloquants
}

/**
 * La règle que REQ-005 impose : un rédhibitoire non satisfait empêche la
 * soumission automatique QUEL QUE SOIT le score. Elle vit ici, en un seul
 * endroit, pour qu'aucun appelant n'ait à s'en souvenir.
 */
export function peutPostulerSeule(bloquants: readonly Redhibitoire[]): boolean {
  return bloquants.length === 0
}
