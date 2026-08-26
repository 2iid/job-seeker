/**
 * JOB-023 — la page carrières d'un employeur, comme source.
 *
 * Palier A, et c'est justifié : la page est celle de l'employeur, pas un
 * intermédiaire. Ce qui y paraît y paraît en premier.
 *
 * Mais le palier ne dit rien de la QUALITÉ de la donnée, et c'est la nuance de
 * ce connecteur. Une API ATS est validée par le fournisseur ; un `JobPosting`
 * dans une page ne l'est par personne. On peut donc y lire des dates
 * rafraîchies chaque nuit pour le référencement, des salaires en devise
 * implicite, des offres pourvues depuis trois mois. Le palier promet la
 * PRIMEUR, jamais l'exactitude — et `validThrough` est la seule borne que la
 * page nous donne pour écarter ce qui est mort.
 *
 * `format-change` plutôt que `aucun-resultat` quand une page servie sans
 * `JobPosting` : c'est la distinction qui empêche de dire « rien pour vous »
 * quand la vérité est « je n'ai pas su lire ». REQ-003.
 */

import type { Connecteur, Recolte } from '../contract.ts'
import { etatDepuisStatut, type Fetch } from '../ats/connecteur.ts'
import { extraireJsonLd } from './extraire.ts'
import { lireJobPostings } from './jobposting.ts'

/** 4 Mo : une page carrières bavarde en fait 300 Ko. Au-delà, on n'est plus au bon endroit. */
const TAILLE_MAX_PAGE = 4 * 1024 * 1024

export type PageCarrieres = {
  /** Identifiant de connecteur, unique dans le registre. */
  readonly id: string
  readonly url: string
  /** Codes ISO du marché servi, ou `'monde'`. */
  readonly pays: readonly string[] | 'monde'
  readonly secteurs?: readonly string[] | 'tous'
}

export function connecteurPageCarrieres(
  page: PageCarrieres,
  options: { fetch?: Fetch; maintenant?: () => Date } = {},
): Connecteur {
  const f = options.fetch ?? globalThis.fetch
  const maintenant = options.maintenant ?? (() => new Date())

  return {
    id: page.id,
    palier: 'a',
    pays: page.pays,
    secteurs: page.secteurs ?? 'tous',
    // Une page HTML n'a pas de latence d'indexation : ce qui y est publié y est.
    latenceAttendueSecondes: 0,
    regime: 'libre',
    // Bas volontairement. Ce n'est pas une API : c'est le site de quelqu'un, et
    // le relever quatre fois par minute serait se comporter en nuisible.
    cadenceMaxParMinute: 2,
    attribution: null,

    async recolter(ctx): Promise<Recolte> {
      let reponse: Response
      try {
        reponse = await f(page.url, {
          signal: ctx.signal ?? AbortSignal.timeout(20_000),
          headers: { accept: 'text/html,application/xhtml+xml' },
        })
      } catch (cause) {
        const delai = cause instanceof Error && /abort|timeout/i.test(cause.name + cause.message)
        return { etat: delai ? 'delai-depasse' : 'injoignable', offres: [] }
      }

      if (!reponse.ok) return { etat: etatDepuisStatut(reponse.status), offres: [] }

      const html = await reponse.text()
      if (html.length > TAILLE_MAX_PAGE) {
        return {
          etat: 'partiel',
          offres: [],
          note: `page de ${Math.round(html.length / 1024)} Ko, au-delà de la borne de lecture`,
        }
      }

      const { blocs, ignores } = extraireJsonLd(html)
      if (blocs.length === 0) {
        // PAS `aucun-resultat`. Une page sans donnée structurée n'est pas une
        // page sans offres : c'est une page qu'on n'a pas su lire. Confondre
        // les deux ferait dire « rien pour vous aujourd'hui » à quelqu'un dont
        // l'employeur visé recrutait.
        return {
          etat: 'format-change',
          offres: [],
          note:
            ignores.length > 0
              ? `aucun bloc lisible ; ${ignores.length} écarté(s)`
              : 'aucune donnée structurée dans la page servie',
        }
      }

      const { offres, ignorees } = lireJobPostings(blocs, maintenant())

      // Des blocs lus, mais aucun `JobPosting` : la page décrit autre chose.
      // C'est encore « je n'ai pas su lire », pas « il n'y a rien ».
      if (offres.length === 0 && ignorees.length === 0) {
        return { etat: 'format-change', offres: [], note: 'aucun JobPosting parmi les blocs lus' }
      }

      const notes = [
        ignorees.length > 0 ? `${ignorees.length} offre(s) écartée(s)` : '',
        ignores.length > 0 ? `${ignores.length} bloc(s) illisible(s)` : '',
      ].filter((n) => n !== '')

      return {
        // `partiel` dès qu'on a écarté quelque chose : la couverture n'est plus
        // affirmable, et `couvertureAffirmable` en dépend.
        etat: notes.length > 0 ? 'partiel' : offres.length === 0 ? 'aucun-resultat' : 'ok',
        offres,
        ...(notes.length > 0 ? { note: notes.join(' · ') } : {}),
      }
    },
  }
}
