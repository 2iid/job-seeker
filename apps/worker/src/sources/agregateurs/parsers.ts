import type { OffreBrute } from '../contract.ts'

/**
 * JOB-024 — le palier B : les agrégateurs et portails qui portent la
 * couverture mondiale et tous secteurs.
 *
 * Écrits contre de vraies réponses, comme les connecteurs ATS. Chacun renvoie
 * `null` pour ce qu'il ne sait pas lire, plutôt que de fabriquer une offre
 * incomplète qui serait affichée avec le même aplomb que les autres.
 */

const texte = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : undefined

// --------------------------------------------------------------------------
//  Arbeitnow — { data: [{ slug, title, company_name, url, location, remote,
//                          created_at (epoch secondes), job_types, tags }] }
// --------------------------------------------------------------------------
export function analyserArbeitnow(charge: unknown): OffreBrute[] {
  const data = obj(charge)?.['data']
  if (!Array.isArray(data)) return []
  return data.flatMap((brut): OffreBrute[] => {
    const j = obj(brut)
    if (j === undefined) return []
    const titre = texte(j['title'])
    const url = texte(j['url'])
    const employeur = texte(j['company_name'])
    const id = texte(j['slug'])
    if (titre === undefined || url === undefined || employeur === undefined || id === undefined) return []
    const lieu = texte(j['location'])
    // Arbeitnow date en SECONDES epoch, là où Lever date en millisecondes.
    // Deux sources, deux unités : c'est exactement le genre de détail qu'une
    // documentation omet et qu'une vraie réponse révèle.
    const cree = j['created_at']
    const publiee = typeof cree === 'number' && Number.isFinite(cree)
      ? new Date(cree * 1000).toISOString()
      : undefined
    return [{
      identifiantSource: id, titre, employeur, urlCandidature: url,
      ...(lieu === undefined ? {} : { lieu }),
      ...(publiee === undefined ? {} : { publieeLe: publiee }),
      ...(j['remote'] === true ? { teletravailTexte: 'distanciel' } : {}),
    }]
  })
}

// --------------------------------------------------------------------------
//  Remotive — { jobs: [{ id, title, company_name, url, candidate_required_location,
//                        publication_date, salary }] }
// --------------------------------------------------------------------------
export function analyserRemotive(charge: unknown): OffreBrute[] {
  const jobs = obj(charge)?.['jobs']
  if (!Array.isArray(jobs)) return []
  return jobs.flatMap((brut): OffreBrute[] => {
    const j = obj(brut)
    if (j === undefined) return []
    const titre = texte(j['title'])
    const url = texte(j['url'])
    const employeur = texte(j['company_name'])
    const id = j['id']
    if (titre === undefined || url === undefined || employeur === undefined || id === undefined) return []
    const lieu = texte(j['candidate_required_location'])
    const salaire = texte(j['salary'])
    return [{
      identifiantSource: String(id), titre, employeur, urlCandidature: url,
      ...(lieu === undefined ? {} : { lieu }),
      ...(texte(j['publication_date']) === undefined ? {} : { publieeLe: texte(j['publication_date'])! }),
      ...(salaire === undefined ? {} : { remunerationTexte: salaire }),
      teletravailTexte: 'distanciel',
    }]
  })
}

// --------------------------------------------------------------------------
//  Jobicy — { jobs: [{ id, jobTitle, companyName, url, jobGeo, pubDate,
//                      salaryMin, salaryMax, salaryCurrency, salaryPeriod }] }
// --------------------------------------------------------------------------
export function analyserJobicy(charge: unknown): OffreBrute[] {
  const jobs = obj(charge)?.['jobs']
  if (!Array.isArray(jobs)) return []
  return jobs.flatMap((brut): OffreBrute[] => {
    const j = obj(brut)
    if (j === undefined) return []
    const titre = texte(j['jobTitle'])
    const url = texte(j['url'])
    const employeur = texte(j['companyName'])
    const id = j['id']
    if (titre === undefined || url === undefined || employeur === undefined || id === undefined) return []

    // Jobicy donne le salaire en champs séparés. On le recompose en texte pour
    // que `lireRemuneration` reste le SEUL endroit qui interprète un salaire —
    // deux chemins d'interprétation finiraient par diverger.
    const min = j['salaryMin']
    const max = j['salaryMax']
    const devise = texte(j['salaryCurrency'])
    const periode = texte(j['salaryPeriod'])
    const salaire =
      typeof min === 'number' && min > 0 && devise !== undefined
        ? `${min}${typeof max === 'number' && max > min ? ` - ${max}` : ''} ${devise} ${periode ?? 'yearly'}`
        : undefined

    return [{
      identifiantSource: String(id), titre, employeur, urlCandidature: url,
      ...(texte(j['jobGeo']) === undefined ? {} : { lieu: texte(j['jobGeo'])! }),
      ...(texte(j['pubDate']) === undefined ? {} : { publieeLe: texte(j['pubDate'])! }),
      ...(salaire === undefined ? {} : { remunerationTexte: salaire }),
      teletravailTexte: 'distanciel',
    }]
  })
}
