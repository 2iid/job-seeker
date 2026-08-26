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

// --------------------------------------------------------------------------
//  Workable — le point d'entrée du WIDGET, pas celui de la documentation.
//
//  `apply.workable.com/api/v3/accounts/<slug>/jobs`, que JOB-021 avait
//  essayé d'après la documentation, répond 404 sur tous les slugs publics.
//  C'est `api/v1/widget/accounts/<slug>?details=true` qui sert les offres, et
//  c'est contre SA réponse — enregistrée le 2026-08-26 — que ceci est écrit.
//
//  Trois différences avec les autres fournisseurs, toutes constatées :
//
//  1. L'identifiant stable est `shortcode`, pas un entier. `code` existe aussi
//     mais c'est une référence interne saisie à la main (« ASMSK 0626 »),
//     parfois vide, jamais garantie unique.
//  2. `telecommuting` est un BOOLÉEN, la seule source de ce lot à le déclarer
//     franchement. On ne rend un texte que quand il vaut `true` : rendre
//     « présentiel » sur `false` transformerait un défaut de saisie en
//     rédhibitoire pour quelqu'un.
//  3. Le lieu se compose de `city`, `state`, `country` — et `locations[]`
//     porte le code pays ISO que les trois autres champs n'ont pas. On prend
//     le premier lieu non caché : `hidden: true` existe, et afficher un lieu
//     que l'employeur a choisi de masquer serait le publier à sa place.
// --------------------------------------------------------------------------
export function analyserWorkable(charge: unknown, employeurParDefaut: string): OffreBrute[] {
  const racine = obj(charge)
  const jobs = racine?.['jobs']
  if (!Array.isArray(jobs)) return []
  const employeurDuBoard = texte(racine?.['name'])

  return jobs.flatMap((brut): OffreBrute[] => {
    const j = obj(brut)
    if (j === undefined) return []
    const titre = texte(j['title'])
    const shortcode = texte(j['shortcode'])
    // `application_url` mène au formulaire, `url` à l'annonce. On garde le
    // formulaire : c'est là qu'on postule, et l'annonce y est atteignable.
    const url = texte(j['application_url']) ?? texte(j['url']) ?? texte(j['shortlink'])
    if (titre === undefined || shortcode === undefined || url === undefined) return []

    const lieu = lieuWorkable(j)
    // `published_on` est la mise en ligne ; `created_at` est la création du
    // brouillon. Une offre créée en janvier et publiée en août paraîtrait
    // vieille de sept mois si on prenait la seconde.
    const publiee = texte(j['published_on']) ?? texte(j['created_at'])
    const description = texte(j['description'])

    return [{
      identifiantSource: shortcode,
      titre,
      employeur: employeurDuBoard ?? employeurParDefaut,
      urlCandidature: url,
      ...(lieu === undefined ? {} : { lieu }),
      ...(publiee === undefined ? {} : { publieeLe: publiee }),
      ...(description === undefined ? {} : { description }),
      // Uniquement quand c'est DÉCLARÉ vrai. `false` peut vouloir dire
      // « présentiel » comme « personne n'a coché la case ».
      ...(j['telecommuting'] === true ? { teletravailTexte: 'distanciel' } : {}),
    }]
  })
}

function lieuWorkable(j: Record<string, unknown>): string | undefined {
  const lieux = j['locations']
  if (Array.isArray(lieux)) {
    // `hidden: true` existe : afficher un lieu que l'employeur a choisi de
    // masquer serait le publier à sa place.
    const visible = lieux.map(obj).find((l) => l !== undefined && l['hidden'] !== true)
    if (visible !== undefined) {
      const morceaux = [texte(visible['city']), texte(visible['region']), texte(visible['countryCode']) ?? texte(visible['country'])]
      const propres = [...new Set(morceaux.filter((m): m is string => m !== undefined && m !== ''))]
      if (propres.length > 0) return propres.join(', ')
    }
  }
  const morceaux = [texte(j['city']), texte(j['state']), texte(j['country'])]
  const propres = [...new Set(morceaux.filter((m): m is string => m !== undefined && m !== ''))]
  return propres.length > 0 ? propres.join(', ') : undefined
}

/**
 * Les entrées BRUTES d'une réponse, avant toute cartographie — ou `null` quand
 * le conteneur attendu est absent.
 *
 * Cette fonction existe parce que « zéro offre » avait deux causes que le
 * connecteur confondait :
 *
 *   · la source a bien répondu, sa liste est vide → il n'y a rien à voir ;
 *   · la source a répondu autre chose que ce qu'on sait lire → on n'a rien VU.
 *
 * Les deux produisaient un tableau vide, donc `aucun-resultat`, donc « rien
 * pour vous aujourd'hui » affiché à quelqu'un dont l'employeur visé recrutait.
 * C'est exactement la faute que REQ-003 nomme, et elle était présente sur les
 * cinq fournisseurs — pas sur celui qu'on venait d'ajouter.
 *
 * Le nombre d'entrées permet en plus d'attraper le cas le plus sournois : un
 * conteneur PLEIN dont aucune entrée ne se cartographie. La forme des éléments
 * a changé, la liste est là, et sans cette comparaison la source paraîtrait
 * simplement vide.
 */
export function entreesBrutes(fournisseur: string, charge: unknown): unknown[] | null {
  const o = obj(charge)
  switch (fournisseur) {
    case 'greenhouse':
    case 'ashby':
    case 'workable': {
      const jobs = o?.['jobs']
      return Array.isArray(jobs) ? jobs : null
    }
    case 'lever':
      return Array.isArray(charge) ? charge : null
    case 'smartrecruiters': {
      const contenu = o?.['content']
      return Array.isArray(contenu) ? contenu : null
    }
    default:
      return null
  }
}
