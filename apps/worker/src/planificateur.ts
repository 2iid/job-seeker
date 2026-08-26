import type { Connecteur, ContexteRecolte } from './sources/contract.ts'
import { Registre, formulerCouverture } from './sources/registre.ts'
import { Cadence, EtatDesSources } from './sources/cadence.ts'
import { dedupliquer, type Entree, type MotifRejet, type OffreNormalisee } from './sources/dedupe.ts'

/**
 * JOB-029 — le planificateur.
 *
 * Il orchestre, il ne décide rien lui-même : les cadences viennent des
 * connecteurs, les priorités du registre, les états du balayage. Tout ce qu'il
 * ajoute est l'ordre et le respect des plafonds.
 *
 * Aucun timer. L'horloge est injectée — un planificateur qu'on ne peut tester
 * qu'en attendant vraiment est un planificateur qu'on ne testera pas.
 */

export type ResultatTour = {
  readonly offres: readonly OffreNormalisee[]
  readonly rejets: Readonly<Partial<Record<MotifRejet, number>>>
  readonly interroges: readonly string[]
  /** Sautés parce que leur cadence ou leur pénalité l'interdisait. */
  readonly reportes: readonly { source: string; attendreMs: number; motif: string }[]
  readonly aveugles: readonly string[]
  /** La phrase que l'interface a le droit d'afficher, et rien de plus. */
  readonly couverture: string
  /** Les attributions exigées par les sources qui ont réellement contribué. */
  readonly attributions: readonly string[]
}

export type Planificateur = {
  readonly tour: (ctx: ContexteRecolte) => Promise<ResultatTour>
  readonly etats: EtatDesSources
}

export function creerPlanificateur(
  registre: Registre,
  options: { horloge?: () => number; cadence?: Cadence; etats?: EtatDesSources } = {},
): Planificateur {
  const horloge = options.horloge ?? (() => Date.now())
  const cadence = options.cadence ?? new Cadence(horloge)
  const etats = options.etats ?? new EtatDesSources(horloge)

  return {
    etats,
    async tour(ctx): Promise<ResultatTour> {
      const candidats = registre.pour({
        ...(ctx.pays === undefined ? {} : { pays: ctx.pays }),
      })

      const retenus: Connecteur[] = []
      const reportes: { source: string; attendreMs: number; motif: string }[] = []

      for (const c of candidats) {
        const d = cadence.demander(c.id, c.cadenceMaxParMinute)
        if (d.autorise) retenus.push(c)
        // Une source pénalisée est SAUTÉE, pas attendue : la faire attendre
        // bloquerait les autres, et une source en panne pénaliserait alors
        // tout le balayage au lieu d'elle seule.
        else reportes.push({ source: c.id, attendreMs: d.attendreMs, motif: d.motif })
      }

      const balayage = await registre.balayer(retenus, ctx, horloge)

      const entrees: Entree[] = []
      for (const r of balayage.resultats) {
        etats.noter(r.connecteur, r.etat)
        if (r.etat === 'ok' || r.etat === 'aucun-resultat') cadence.reussit(r.connecteur)
        if (r.etat === 'quota-atteint') {
          // La source a dit non : on l'écoute, en lisant son délai quand elle
          // en donne un plutôt qu'en calculant le nôtre.
          const retry = /retry-after:(\d+)/.exec(r.note ?? '')?.[1]
          cadence.refuse(r.connecteur, retry === undefined ? undefined : Number(retry))
        }
        const c = retenus.find((x) => x.id === r.connecteur)
        if (c === undefined) continue
        for (const offre of r.offres) {
          entrees.push({
            source: r.connecteur,
            palier: r.palier,
            latenceSecondes: r.latenceAttendueSecondes,
            offre,
          })
        }
      }

      const { offres, rejets } = dedupliquer(entrees)

      const parMotif: Partial<Record<MotifRejet, number>> = {}
      for (const r of rejets) parMotif[r.motif] = (parMotif[r.motif] ?? 0) + 1

      // On ne réclame l'attribution que des sources qui ont RÉELLEMENT
      // contribué : l'afficher pour une source muette serait un crédit inexact.
      const contributrices = new Set(
        balayage.resultats.filter((r) => r.offres.length > 0).map((r) => r.connecteur),
      )
      const attributions = retenus
        .filter((c) => contributrices.has(c.id) && c.attribution !== null)
        .map((c) => c.attribution as string)

      return {
        offres,
        rejets: parMotif,
        interroges: retenus.map((c) => c.id),
        reportes,
        aveugles: balayage.sourcesAveugles,
        couverture: formulerCouverture(balayage),
        attributions: [...new Set(attributions)],
      }
    },
  }
}
