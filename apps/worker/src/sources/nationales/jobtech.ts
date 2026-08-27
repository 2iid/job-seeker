/**
 * JOB-089 — JobTech, le service public suédois de l'emploi.
 *
 * C'est la première source rencontrée qui fasse ce que le produit promettait :
 * couvrir un métier ordinaire, dans un pays donné, sur place. Interrogée le
 * 2026-08-27 : **2 028** postes d'infirmier, **963** d'enseignant, **79** de
 * comptable — avec l'employeur, l'URL de candidature, la date de publication
 * ET la date limite.
 *
 * Ni les agrégateurs de distanciel (`JOB-076`), ni les sites d'employeurs
 * (`JOB-088`), ni The Muse (mesuré plus haut) n'y parviennent. Un portail
 * public national, lui, y parvient — parce que c'est exactement ce qu'il est
 * fait pour faire.
 *
 * ── Ce que cette source apporte et que les autres n'ont pas ──
 *
 * `application_deadline`. Aucune des sources précédentes ne dit quand une offre
 * cesse d'être candidatable. C'est précisément ce dont `JOB-048` a besoin pour
 * archiver un élément de file plutôt que de l'envoyer après coup — et jusqu'ici
 * cette échéance était toujours nulle, donc la règle ne s'appliquait jamais.
 *
 * Une source qui fournit sa date limite rend une garantie du produit
 * OPÉRANTE, pas seulement écrite.
 *
 * ── Palier B, et pourquoi pas A ──
 *
 * L'offre est publiée chez l'employeur puis remontée au portail. Le portail
 * date sa publication CHEZ LUI, pas chez l'employeur — la même distinction que
 * pour un agrégateur. Le déclarer palier A ferait promettre une primeur qu'on
 * n'a pas.
 */

import type { Connecteur, OffreBrute, Recolte } from '../contract.ts'
import { etatDepuisStatut, type Fetch } from '../ats/connecteur.ts'

const RACINE = 'https://jobsearch.api.jobtechdev.se/search'

type OffreJobTech = {
  id?: string
  headline?: string
  description?: { text?: string; text_formatted?: string }
  employer?: { name?: string }
  workplace_address?: { municipality?: string; region?: string; country?: string }
  application_details?: { url?: string; email?: string }
  webpage_url?: string
  publication_date?: string
  application_deadline?: string
  remote_work?: boolean
}

const texte = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined

export function analyserJobTech(charge: unknown): OffreBrute[] {
  const r = charge as { hits?: OffreJobTech[] }
  if (!Array.isArray(r?.hits)) return []

  return r.hits.flatMap((j): OffreBrute[] => {
    const titre = texte(j.headline)
    const id = texte(j.id)
    // `application_details.url` mène au formulaire de l'employeur ;
    // `webpage_url` à l'annonce sur le portail. On préfère le formulaire, et
    // on se rabat sur l'annonce — mais jamais sur rien : une offre sans lien
    // remplirait le flux de choses sur lesquelles on ne peut pas agir.
    const url = texte(j.application_details?.url) ?? texte(j.webpage_url)
    if (titre === undefined || id === undefined || url === undefined) return []

    const a = j.workplace_address ?? {}
    const lieu = [texte(a.municipality), texte(a.region)]
      .filter((x): x is string => x !== undefined)
      .join(', ')

    const description = texte(j.description?.text)

    return [{
      identifiantSource: id,
      titre,
      employeur: texte(j.employer?.name) ?? '',
      urlCandidature: url,
      ...(texte(j.publication_date) !== undefined ? { publieeLe: texte(j.publication_date)! } : {}),
      ...(lieu !== '' ? { lieu } : {}),
      ...(description !== undefined ? { description } : {}),
      // Uniquement quand c'est DÉCLARÉ vrai. `false` peut vouloir dire
      // « présentiel » comme « personne n'a coché la case ».
      ...(j.remote_work === true ? { teletravailTexte: 'distanciel' } : {}),
    }]
  })
}

/**
 * Les dates limites, indexées par identifiant d'offre.
 *
 * Rendues à part du contrat `OffreBrute`, qui n'a pas de champ pour ça : le
 * contrat est partagé par toutes les sources, et une seule sait aujourd'hui
 * répondre. L'ajouter au contrat obligerait les autres à mentir en le
 * remplissant, ou à le laisser nul en donnant l'impression d'une information
 * manquante plutôt qu'inexistante.
 */
export function echeances(charge: unknown): ReadonlyMap<string, string> {
  const r = charge as { hits?: OffreJobTech[] }
  if (!Array.isArray(r?.hits)) return new Map()
  const m = new Map<string, string>()
  for (const j of r.hits) {
    const id = texte(j.id)
    const fin = texte(j.application_deadline)
    if (id !== undefined && fin !== undefined) m.set(id, fin)
  }
  return m
}

export function connecteurJobTech(options: { fetch?: Fetch } = {}): Connecteur {
  const f = options.fetch ?? globalThis.fetch
  return {
    id: 'national-jobtech-se',
    palier: 'b',
    pays: ['SE'],
    secteurs: 'tous',
    // Le portail agrège des offres déjà publiées ailleurs ; un jour de latence
    // est l'ordre de grandeur honnête tant qu'on ne l'a pas mesuré.
    latenceAttendueSecondes: 86_400,
    regime: 'libre',
    cadenceMaxParMinute: 6,
    attribution: null,

    async recolter(ctx): Promise<Recolte> {
      const params = new URLSearchParams({ limit: '100' })
      if (ctx.requete !== '') params.set('q', ctx.requete)

      let reponse: Response
      try {
        reponse = await f(`${RACINE}?${params.toString()}`, {
          signal: ctx.signal ?? AbortSignal.timeout(20_000),
          headers: { accept: 'application/json' },
        })
      } catch (cause) {
        const nom = cause instanceof Error ? cause.name : ''
        return {
          etat: nom === 'TimeoutError' || nom === 'AbortError' ? 'delai-depasse' : 'injoignable',
          offres: [],
        }
      }
      if (!reponse.ok) return { etat: etatDepuisStatut(reponse.status), offres: [] }

      let charge: unknown
      try {
        charge = await reponse.json()
      } catch {
        return { etat: 'format-change', offres: [] }
      }

      const brutes = (charge as { hits?: unknown[] })?.hits
      if (!Array.isArray(brutes)) {
        return { etat: 'format-change', offres: [], note: 'liste d offres absente de la réponse' }
      }
      const offres = analyserJobTech(charge)
      if (brutes.length > 0 && offres.length === 0) {
        return {
          etat: 'format-change',
          offres: [],
          note: `${brutes.length} entrée(s) reçue(s), aucune lisible`,
        }
      }
      return { etat: offres.length === 0 ? 'aucun-resultat' : 'ok', offres }
    },
  }
}
