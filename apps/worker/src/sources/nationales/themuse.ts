/**
 * JOB-089 — The Muse, et pourquoi on ne croit pas son filtre.
 *
 * `JOB-076` puis `JOB-088` ont montré la lacune : ni les agrégateurs de
 * distanciel tech, ni les sites d'employeurs ne couvrent un infirmier à Nantes
 * ou un comptable à Lyon. The Muse est la première source rencontrée qui rende
 * du non-tech en volume — santé, gestion, vente, administration — sans clé.
 *
 * ── Le piège, mesuré le 2026-08-27 ──
 *
 * Son paramètre `location` est **silencieusement permissif**. Interrogée sur
 * « Dakar, Senegal » elle annonce 6 340 offres et en rend 33 dont **ZÉRO** ne
 * concerne le Sénégal — vingt sont « Flexible / Remote » et le reste est au
 * Texas. Même résultat pour Lyon. Pour Bangalore, douze sur vingt-huit
 * concordent ; pour Paris, six sur trente-trois.
 *
 *   Dakar      0 / 33      Lyon       0 / 33
 *   Bogota     1 / 31      Paris      6 / 33
 *   Bangalore 12 / 28
 *
 * Le filtre n'échoue pas : il est ignoré, et la réponse a l'air normale.
 * Reprendre `page_count` pour annoncer « 6 340 offres à Dakar » serait un
 * mensonge pur — le genre qu'on ne découvre qu'en ouvrant la troisième offre.
 *
 * ── D'où la règle de ce connecteur ──
 *
 * On envoie l'indice de lieu, parce qu'il aide réellement là où la source
 * connaît la ville. Puis on **filtre chez nous, sur le lieu réellement rendu**,
 * et on ne compte que ce qui a passé ce filtre. C'est la même distinction que
 * `JOB-090` : ce que la source DÉCLARE n'est pas ce qu'elle SERT.
 */

import type { Connecteur, OffreBrute, Recolte } from '../contract.ts'
import type { Fetch } from '../ats/connecteur.ts'
import { etatDepuisStatut } from '../ats/connecteur.ts'

const RACINE = 'https://www.themuse.com/api/public/jobs'

/** Les marqueurs d'une offre distancielle chez cette source. */
const DISTANCIEL = /flexible \/ remote|remote/i

type OffreMuse = {
  id?: number
  name?: string
  publication_date?: string
  contents?: string
  company?: { name?: string }
  locations?: { name?: string }[]
  categories?: { name?: string }[]
  refs?: { landing_page?: string }
}

const texte = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined

/**
 * Le lieu concorde-t-il RÉELLEMENT avec ce qu'on a demandé ?
 *
 * La comparaison porte sur la ville ET le pays séparément : « Paris, France »
 * demandé doit accepter « Paris, France » rendu, et refuser « Paris, TX » —
 * qui existe, qui est au Texas, et que la source rend volontiers.
 */
export function lieuConcorde(rendu: string, demande: string | null): boolean {
  if (demande === null) return true
  const [ville, pays] = demande.split(',').map((s) => s.trim().toLowerCase())
  const r = rendu.toLowerCase()
  if (ville === undefined || ville === '') return true
  if (!r.includes(ville)) return false
  // Sans pays demandé, la ville suffit. Avec, il doit concorder aussi.
  return pays === undefined || pays === '' || r.includes(pays)
}

export function analyser(
  charge: unknown,
  lieuDemande: string | null,
  accepteDistanciel: boolean,
): { offres: OffreBrute[]; rendues: number } {
  const r = charge as { results?: OffreMuse[] }
  if (!Array.isArray(r?.results)) return { offres: [], rendues: 0 }

  const offres = r.results.flatMap((j): OffreBrute[] => {
    const titre = texte(j.name)
    const url = texte(j.refs?.landing_page)
    const id = j.id
    if (titre === undefined || url === undefined || id === undefined) return []

    const lieux = (j.locations ?? []).map((l) => texte(l.name)).filter((l): l is string => l !== undefined)
    const distanciel = lieux.some((l) => DISTANCIEL.test(l))

    // Le filtre EST le connecteur. Sans lui, on rendrait des postes au Texas à
    // quelqu'un qui cherche à Dakar, et on les compterait comme une couverture.
    const retenu =
      lieuDemande === null ||
      lieux.some((l) => lieuConcorde(l, lieuDemande)) ||
      (accepteDistanciel && distanciel)
    if (!retenu) return []

    // La description est du HTML chez cette source ; on la rend en texte, comme
    // partout ailleurs, parce qu'elle finira dans un contexte de modèle.
    const description = texte(j.contents)
      ?.replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    return [{
      identifiantSource: String(id),
      titre,
      employeur: texte(j.company?.name) ?? '',
      urlCandidature: url,
      ...(texte(j.publication_date) !== undefined ? { publieeLe: texte(j.publication_date)! } : {}),
      ...(lieux.length > 0 ? { lieu: lieux.join(' · ') } : {}),
      ...(description !== undefined && description !== '' ? { description } : {}),
      ...(distanciel ? { teletravailTexte: 'distanciel' } : {}),
    }]
  })

  return { offres, rendues: r.results.length }
}

export function connecteurTheMuse(options: { fetch?: Fetch } = {}): Connecteur {
  const f = options.fetch ?? globalThis.fetch
  return {
    id: 'national-themuse',
    // Palier B : c'est un agrégateur. Il ne sait pas quand l'offre a été
    // publiée chez l'employeur, seulement quand elle est arrivée chez lui.
    palier: 'b',
    pays: 'monde',
    secteurs: 'tous',
    latenceAttendueSecondes: 3600,
    regime: 'libre',
    cadenceMaxParMinute: 4,
    attribution: null,

    async recolter(ctx): Promise<Recolte> {
      const params = new URLSearchParams({ page: '1' })
      // L'indice de lieu est envoyé quand même : il aide réellement là où la
      // source connaît la ville — douze concordances sur vingt-huit à
      // Bangalore contre zéro sans indice.
      const lieu = ctx.pays === undefined ? null : ctx.pays
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

      const { offres, rendues } = analyser(charge, lieu, true)

      if (rendues === 0) return { etat: 'aucun-resultat', offres: [] }
      if (offres.length === 0) {
        // La source a répondu, et RIEN de ce qu'elle a rendu ne concerne le
        // lieu demandé. Ce n'est pas « aucune offre » : c'est « cette source
        // ne sert pas ce marché », et l'écran doit pouvoir le dire.
        return {
          etat: 'aucun-resultat',
          offres: [],
          note: `${rendues} offre(s) rendue(s), aucune ne concerne ${lieu ?? 'le marché visé'}`,
        }
      }
      return {
        etat: offres.length < rendues ? 'partiel' : 'ok',
        offres,
        ...(offres.length < rendues
          ? { note: `${offres.length} retenue(s) sur ${rendues} rendue(s) — le filtre de lieu de la source n'est pas fiable` }
          : {}),
      }
    },
  }
}
