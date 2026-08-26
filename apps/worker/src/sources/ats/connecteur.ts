import type { Connecteur, EtatSource, OffreBrute, Recolte } from '../contract.ts'
import { type Board, urlBoard } from './decouverte.ts'
import { analyserAshby, analyserGreenhouse, analyserLever, analyserSmartRecruiters, analyserWorkable, entreesBrutes } from './parsers.ts'

/**
 * JOB-021 — un board ATS devient un connecteur du palier A.
 *
 * Le cœur de ce fichier est la traduction d'une réponse HTTP en `EtatSource`.
 * C'est là que se joue REQ-003 : un 429, un 403 ou un JSON illisible ne
 * signifient PAS « cette entreprise ne recrute pas ». Confondre les deux ferait
 * dire au produit « rien pour vous » alors qu'il n'a simplement pas su regarder.
 */

/** Plafond de lecture : une réponse démesurée est une panne, pas une aubaine. */
export const TAILLE_MAX_OCTETS = 8 * 1024 * 1024
const DELAI_MS = 12_000

export type Fetch = typeof globalThis.fetch

export function etatDepuisStatut(statut: number): EtatSource {
  if (statut === 429) return 'quota-atteint'
  if (statut === 401 || statut === 403) return 'auth-refusee'
  // 404 sur un board : le slug ne correspond à rien. Ce n'est pas « aucune
  // offre » — c'est une découverte à refaire (JOB-022).
  if (statut === 404) return 'non-configure'
  if (statut >= 500) return 'injoignable'
  if (statut >= 400) return 'erreur'
  return 'ok'
}

function analyser(board: Board, charge: unknown, employeur: string): OffreBrute[] {
  switch (board.fournisseur) {
    case 'greenhouse': return analyserGreenhouse(charge, employeur)
    case 'ashby': return analyserAshby(charge, employeur)
    case 'lever': return analyserLever(charge, employeur)
    case 'smartrecruiters': return analyserSmartRecruiters(charge, board.slug, employeur)
    // JOB-083 : analyseur écrit contre une réponse RÉELLE, enregistrée le
    // 2026-08-26 sur le point d'entrée du widget — celui de la documentation
    // que JOB-021 avait essayé répond 404 sur tous les slugs publics.
    case 'workable': return analyserWorkable(charge, employeur)
  }
}

export function connecteurAts(
  board: Board,
  employeur: string,
  options: { fetch?: Fetch; latenceSecondes?: number } = {},
): Connecteur {
  const f = options.fetch ?? globalThis.fetch
  return {
    id: `ats-${board.fournisseur}-${board.slug}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40),
    palier: 'a',
    pays: 'monde',
    secteurs: 'tous',
    latenceAttendueSecondes: options.latenceSecondes ?? 180,
    regime: 'libre',
    cadenceMaxParMinute: 12,
    // Un board public d'employeur n'exige aucune attribution.
    attribution: null,

    async recolter(ctx): Promise<Recolte> {
      let reponse: Response
      try {
        reponse = await f(urlBoard(board), {
          signal: ctx.signal ?? AbortSignal.timeout(DELAI_MS),
          headers: { accept: 'application/json' },
          redirect: 'follow',
        })
      } catch (cause) {
        const nom = cause instanceof Error ? cause.name : ''
        return { etat: nom === 'TimeoutError' || nom === 'AbortError' ? 'delai-depasse' : 'injoignable', offres: [] }
      }

      if (!reponse.ok) {
        const etat = etatDepuisStatut(reponse.status)
        const retry = reponse.headers.get('retry-after')
        return { etat, offres: [], ...(retry === null ? {} : { note: `retry-after:${retry}` }) }
      }

      // Une réponse démesurée est une panne, pas une aubaine : on refuse de la
      // charger en mémoire plutôt que de faire tomber le worker.
      const taille = Number(reponse.headers.get('content-length') ?? '0')
      if (taille > TAILLE_MAX_OCTETS) {
        return { etat: 'format-change', offres: [], note: `réponse de ${taille} octets` }
      }

      let charge: unknown
      try {
        charge = await reponse.json()
      } catch {
        // Du JSON illisible sur une API qui en servait hier, c'est un
        // changement de format — pas une absence d'offres.
        return { etat: 'format-change', offres: [] }
      }

      // « Zéro offre » a DEUX causes, et les confondre est la faute que
      // REQ-003 nomme. On les sépare ici, en un seul endroit, pour les cinq
      // fournisseurs.
      const entrees = entreesBrutes(board.fournisseur, charge)
      if (entrees === null) {
        // Le conteneur attendu n'est pas là : la réponse a changé de forme, ou
        // ce n'est pas la réponse qu'on croyait interroger. On n'a rien VU.
        return { etat: 'format-change', offres: [], note: 'liste d offres absente de la réponse' }
      }

      const offres = analyser(board, charge, employeur)

      if (entrees.length > 0 && offres.length === 0) {
        // Le cas le plus sournois : la liste est PLEINE et aucune entrée ne se
        // cartographie. La forme des éléments a changé. Sans cette
        // comparaison, la source paraîtrait simplement vide.
        return {
          etat: 'format-change',
          offres: [],
          note: `${entrees.length} entrée(s) reçue(s), aucune lisible`,
        }
      }

      // Ici seulement, un tableau vide veut dire ce qu'il dit.
      return { etat: offres.length === 0 ? 'aucun-resultat' : 'ok', offres }
    },
  }
}
