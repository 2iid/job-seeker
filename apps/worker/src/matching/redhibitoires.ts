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
}

export type Redhibitoire = {
  readonly code: 'employeur-exclu' | 'hors-zone' | 'sans-autorisation' | 'presence-refusee' | 'mot-redhibitoire'
  readonly explication: string
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

  if (c.employeursExclus.some((e) => sansAccent(e) === sansAccent(o.employeurCanonique))) {
    bloquants.push({
      code: 'employeur-exclu',
      explication: `Vous avez exclu cet employeur. Je ne la présente pas et je ne postulerai pas.`,
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

  const texte = sansAccent(`${o.titre} ${o.description ?? ''}`)
  for (const mot of c.motsRedhibitoires) {
    if (mot.trim() !== '' && texte.includes(sansAccent(mot))) {
      bloquants.push({
        code: 'mot-redhibitoire',
        explication: `L'offre mentionne « ${mot} », que vous avez marqué comme rédhibitoire.`,
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
