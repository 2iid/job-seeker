import type { OffreBrute } from '../contract.ts'

/**
 * JOB-021 — l'analyse des réponses des boards ATS du palier A.
 *
 * PORTAGE. La stratégie à trois paliers et la découverte du board depuis la
 * page carrière viennent de `skills/last30days/scripts/lib/jobs.py` du projet
 * mvanhorn/last30days-skill, sous licence MIT © 2026 Matt Van Horn. L'avis est
 * reproduit dans LICENSES/ et l'inventaire dans THIRD_PARTY_NOTICES.md, dans
 * cette même livraison : une œuvre dérivée porte l'obligation avec elle.
 *
 * Ces analyseurs sont écrits contre de VRAIES réponses, enregistrées dans
 * `fixtures/`. Un analyseur écrit d'après une documentation renvoie « aucune
 * offre » quand la forme diffère — et REQ-003 interdit précisément de
 * confondre un échec avec une absence.
 *
 * Chacun renvoie `null` pour une entrée qu'il ne sait pas lire, au lieu de
 * fabriquer une offre incomplète : `dedupliquer` la rejettera de toute façon,
 * mais avec un motif, et un motif se compte.
 */

const texte = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : undefined

// --------------------------------------------------------------------------
//  Greenhouse — { jobs: [{ id, title, absolute_url, location: {name}, ... }] }
// --------------------------------------------------------------------------
export function analyserGreenhouse(charge: unknown, employeurParDefaut: string): OffreBrute[] {
  const jobs = obj(charge)?.['jobs']
  if (!Array.isArray(jobs)) return []
  return jobs.flatMap((brut): OffreBrute[] => {
    const j = obj(brut)
    if (j === undefined) return []
    const titre = texte(j['title'])
    const url = texte(j['absolute_url'])
    const id = j['id']
    if (titre === undefined || url === undefined || id === undefined) return []
    const lieu = texte(obj(j['location'])?.['name'])
    // `first_published` est la date de MISE EN LIGNE ; `updated_at` bouge à
    // chaque retouche et ferait paraître fraîche une offre de six mois.
    const publiee = texte(j['first_published']) ?? texte(j['updated_at'])
    return [{
      identifiantSource: String(id),
      titre,
      employeur: texte(j['company_name']) ?? employeurParDefaut,
      urlCandidature: url,
      ...(lieu === undefined ? {} : { lieu }),
      ...(publiee === undefined ? {} : { publieeLe: publiee }),
    }]
  })
}

// --------------------------------------------------------------------------
//  Ashby — { jobs: [{ id, title, location, publishedAt, applyUrl, isRemote }] }
// --------------------------------------------------------------------------
export function analyserAshby(charge: unknown, employeurParDefaut: string): OffreBrute[] {
  const jobs = obj(charge)?.['jobs']
  if (!Array.isArray(jobs)) return []
  return jobs.flatMap((brut): OffreBrute[] => {
    const j = obj(brut)
    if (j === undefined) return []
    // `isListed: false` = retirée du board. La collecter afficherait une offre
    // à laquelle plus personne ne peut postuler.
    if (j['isListed'] === false) return []
    const titre = texte(j['title'])
    const url = texte(j['applyUrl']) ?? texte(j['jobUrl'])
    const id = texte(j['id'])
    if (titre === undefined || url === undefined || id === undefined) return []
    const lieu = texte(j['location'])
    const publiee = texte(j['publishedAt'])
    const teletravail = j['isRemote'] === true ? 'distanciel' : undefined
    const description = texte(j['descriptionPlain'])
    return [{
      identifiantSource: id,
      titre,
      employeur: employeurParDefaut,
      urlCandidature: url,
      ...(lieu === undefined ? {} : { lieu }),
      ...(publiee === undefined ? {} : { publieeLe: publiee }),
      ...(teletravail === undefined ? {} : { teletravailTexte: teletravail }),
      ...(description === undefined ? {} : { description }),
    }]
  })
}

// --------------------------------------------------------------------------
//  Lever — [{ id, text, createdAt (ms), hostedUrl, categories: {location} }]
// --------------------------------------------------------------------------
export function analyserLever(charge: unknown, employeurParDefaut: string): OffreBrute[] {
  if (!Array.isArray(charge)) return []
  return charge.flatMap((brut): OffreBrute[] => {
    const j = obj(brut)
    if (j === undefined) return []
    const titre = texte(j['text'])
    const url = texte(j['hostedUrl']) ?? texte(j['applyUrl'])
    const id = texte(j['id'])
    if (titre === undefined || url === undefined || id === undefined) return []
    const lieu = texte(obj(j['categories'])?.['location'])
    // Lever donne un horodatage en MILLISECONDES. Le passer tel quel à `new
    // Date` en secondes daterait toutes les offres de 1970.
    const cree = j['createdAt']
    const publiee = typeof cree === 'number' && Number.isFinite(cree)
      ? new Date(cree).toISOString()
      : undefined
    const description = texte(j['descriptionPlain'])
    return [{
      identifiantSource: id,
      titre,
      employeur: employeurParDefaut,
      urlCandidature: url,
      ...(lieu === undefined ? {} : { lieu }),
      ...(publiee === undefined ? {} : { publieeLe: publiee }),
      ...(description === undefined ? {} : { description }),
    }]
  })
}

// --------------------------------------------------------------------------
//  SmartRecruiters — { content: [{ id, name, releasedDate, location, company }] }
// --------------------------------------------------------------------------
export function analyserSmartRecruiters(charge: unknown, slug: string, employeurParDefaut: string): OffreBrute[] {
  const contenu = obj(charge)?.['content']
  if (!Array.isArray(contenu)) return []
  return contenu.flatMap((brut): OffreBrute[] => {
    const j = obj(brut)
    if (j === undefined) return []
    const titre = texte(j['name'])
    const id = texte(j['id'])
    if (titre === undefined || id === undefined) return []
    const lieu = obj(j['location'])
    const lieuTexte = texte(lieu?.['fullLocation'])
      ?? [texte(lieu?.['city']), texte(lieu?.['country'])].filter(Boolean).join(', ')
    const teletravail = lieu?.['remote'] === true ? 'distanciel' : lieu?.['hybrid'] === true ? 'hybride' : undefined
    const publiee = texte(j['releasedDate'])
    return [{
      identifiantSource: id,
      titre,
      employeur: texte(obj(j['company'])?.['name']) ?? employeurParDefaut,
      // `ref` pointe vers l'API, pas vers un formulaire : un candidat ne peut
      // pas postuler sur une URL d'API.
      urlCandidature: `https://jobs.smartrecruiters.com/${slug}/${id}`,
      ...(lieuTexte === '' ? {} : { lieu: lieuTexte }),
      ...(publiee === undefined ? {} : { publieeLe: publiee }),
      ...(teletravail === undefined ? {} : { teletravailTexte: teletravail }),
    }]
  })
}
