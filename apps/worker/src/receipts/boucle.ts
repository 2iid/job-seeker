/**
 * JOB-055 — faire tourner la réconciliation, et savoir quand elle ne tourne
 * plus.
 *
 * ── Le détecteur est lui-même une chose qui peut tomber ──
 *
 * « Le produit alerte plutôt que de laisser un trou » n'est vrai que tant que
 * quelque chose CHERCHE les trous. Une réconciliation arrêtée ne produit aucune
 * erreur : elle produit zéro incident, ce qui ressemble exactement à « tout va
 * bien ». C'est la forme de panne la plus coûteuse — celle qui a l'air d'un
 * succès.
 *
 * D'où `derniereReussite` : la sonde de santé du worker s'en sert pour dire
 * qu'il est dégradé quand la recherche de trous n'a pas abouti depuis trop
 * longtemps. Le silence devient alors visible.
 */

import type pg from 'pg'
import { reconcilier, type Bilan } from './reconciliation.ts'

export type EtatBoucle = {
  derniereReussite: Date | null
  derniereErreur: string | null
  enCours: boolean
  toursReussis: number
}

export function etatInitial(): EtatBoucle {
  return { derniereReussite: null, derniereErreur: null, enCours: false, toursReussis: 0 }
}

/**
 * Un tour. Rend le bilan, ou null si un tour était déjà en cours.
 *
 * Le verrou n'est pas une optimisation : sur une base chargée, une
 * réconciliation peut dépasser son intervalle, et deux tours simultanés
 * ouvriraient les mêmes incidents en se marchant dessus. Le `on conflict`
 * l'absorberait, mais on doublerait le travail exactement quand la base
 * souffre déjà.
 */
export async function unTour(
  db: pg.Client | pg.Pool,
  etat: EtatBoucle,
  horloge: () => Date = () => new Date(),
): Promise<Bilan | null> {
  if (etat.enCours) return null
  etat.enCours = true
  try {
    const bilan = await reconcilier(db)
    etat.derniereReussite = horloge()
    etat.derniereErreur = null
    etat.toursReussis += 1
    return bilan
  } catch (cause) {
    // On NE remonte PAS : une erreur de réconciliation ne doit pas tuer le
    // worker, qui a d'autres choses à faire. Elle est retenue, et la sonde de
    // santé la rendra visible.
    etat.derniereErreur = cause instanceof Error ? cause.message : String(cause)
    return null
  } finally {
    etat.enCours = false
  }
}

export const PERIODE_MS = 60_000
/**
 * Au-delà, le worker se déclare dégradé. Trois périodes : une de retard est un
 * hasard d'ordonnancement, trois sont une panne.
 */
export const RETARD_TOLERE_MS = PERIODE_MS * 3

export type SanteReconciliation = { ok: boolean; raison: string | null }

export function evaluerReconciliation(
  etat: EtatBoucle,
  maintenant: Date,
  demarreLe: Date,
): SanteReconciliation {
  if (etat.derniereReussite === null) {
    // Au démarrage, n'avoir jamais réconcilié est normal — pendant un temps.
    // Sans cette tolérance, le worker naîtrait dégradé et l'alerte perdrait
    // tout son sens dès la première minute.
    const depuis = maintenant.getTime() - demarreLe.getTime()
    return depuis <= RETARD_TOLERE_MS
      ? { ok: true, raison: null }
      : { ok: false, raison: 'la recherche de trous n’a jamais abouti depuis le démarrage' }
  }
  const retard = maintenant.getTime() - etat.derniereReussite.getTime()
  if (retard > RETARD_TOLERE_MS) {
    return {
      ok: false,
      raison: `la recherche de trous n’a pas abouti depuis ${String(Math.round(retard / 1000))} s`,
    }
  }
  return { ok: true, raison: null }
}
