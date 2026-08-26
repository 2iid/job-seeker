import type { Connecteur, Recolte } from '../contract.ts'
import { etatDepuisStatut, type Fetch } from '../ats/connecteur.ts'
import { analyserArbeitnow, analyserJobicy, analyserRemotive } from './parsers.ts'

/**
 * Les connecteurs du palier B (JOB-024).
 *
 * Deux faits, lus dans les mentions légales des sources elles-mêmes, sont
 * portés par le CONTRAT plutôt que par la mémoire de quelqu'un :
 *
 *  - Remotive retarde ses offres de 24 h et le dit dans sa propre réponse. Le
 *    déclarer à 3600 s ferait afficher « vue il y a 12 min » sur une offre qui
 *    a déjà un jour — un mensonge sur la seule promesse du produit.
 *  - Remotive et Jobicy EXIGENT une attribution visible. Sans elle, Remotive
 *    coupe l'accès. Le champ `attribution` la transporte jusqu'à l'écran.
 */

type Definition = {
  id: string
  url: string
  latence: number
  attribution: string | null
  analyser: (charge: unknown) => ReturnType<typeof analyserArbeitnow>
}

const DEFINITIONS: readonly Definition[] = [
  {
    id: 'agregateur-arbeitnow',
    url: 'https://www.arbeitnow.com/api/job-board-api',
    latence: 3600,
    attribution: null,
    analyser: analyserArbeitnow,
  },
  {
    id: 'agregateur-remotive',
    url: 'https://remotive.com/api/remote-jobs',
    // 24 h, annoncées par la source dans sa propre réponse.
    latence: 86_400,
    attribution: 'Offres fournies par Remotive — lien vers l’annonce d’origine obligatoire.',
    analyser: analyserRemotive,
  },
  {
    id: 'agregateur-jobicy',
    url: 'https://jobicy.com/api/v2/remote-jobs',
    latence: 3600,
    attribution: 'Offres fournies par Jobicy — lien direct vers l’annonce d’origine obligatoire.',
    analyser: analyserJobicy,
  },
]

export function connecteursAgregateurs(options: { fetch?: Fetch } = {}): readonly Connecteur[] {
  const f = options.fetch ?? globalThis.fetch
  return DEFINITIONS.map((d): Connecteur => ({
    id: d.id,
    palier: 'b',
    pays: 'monde',
    secteurs: 'tous',
    latenceAttendueSecondes: d.latence,
    regime: 'libre',
    cadenceMaxParMinute: 4,
    attribution: d.attribution,

    async recolter(ctx): Promise<Recolte> {
      let reponse: Response
      try {
        reponse = await f(d.url, {
          signal: ctx.signal ?? AbortSignal.timeout(15_000),
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
      const offres = d.analyser(charge)
      return { etat: offres.length === 0 ? 'aucun-resultat' : 'ok', offres }
    },
  }))
}
