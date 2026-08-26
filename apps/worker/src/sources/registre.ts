import {
  type Connecteur,
  type ContexteRecolte,
  type EtatSource,
  type Palier,
  type Recolte,
  assertValide,
  couvertureAffirmable,
} from './contract.ts'

/**
 * Le registre des sources (JOB-019).
 *
 * Il ne connaît AUCUNE source en particulier : ajouter un pays ou un secteur,
 * c'est enregistrer un connecteur. C'est la promesse d'ADR-0002, et le test
 * `enregistre un connecteur factice sans toucher au moteur` est ce qui
 * l'empêche de se perdre.
 */

export type ResultatSource = {
  readonly connecteur: string
  readonly palier: Palier
  readonly etat: EtatSource
  readonly offres: Recolte['offres']
  readonly latenceAttendueSecondes: number
  readonly dureeMs: number
  readonly note?: string
}

export type Balayage = {
  readonly resultats: readonly ResultatSource[]
  /** Sources qui ont RÉELLEMENT répondu : les seules dont l'absence veut dire quelque chose. */
  readonly sourcesAffirmables: readonly string[]
  /** Sources aveugles : on ne sait pas ce qu'elles avaient. */
  readonly sourcesAveugles: readonly string[]
}

export class Registre {
  readonly #connecteurs = new Map<string, Connecteur>()

  /** Refuse un connecteur mal déclaré à l'ENREGISTREMENT, pas à l'exécution. */
  enregistrer(c: Connecteur): void {
    assertValide(c)
    if (this.#connecteurs.has(c.id)) throw new Error(`connecteur déjà enregistré : ${c.id}`)
    this.#connecteurs.set(c.id, c)
  }

  get taille(): number {
    return this.#connecteurs.size
  }

  tous(): readonly Connecteur[] {
    return [...this.#connecteurs.values()]
  }

  /**
   * Sélectionne les connecteurs pertinents. Une source de palier C n'est
   * JAMAIS sélectionnée pour une récolte automatique : ses conditions
   * l'interdisent, et le produit assiste au lieu de postuler.
   */
  pour(criteres: { pays?: string; secteur?: string; paliers?: readonly Palier[] }): readonly Connecteur[] {
    const paliers = criteres.paliers ?? (['a', 'b'] as const)
    return this.tous().filter((c) => {
      if (!paliers.includes(c.palier)) return false
      if (criteres.pays !== undefined && c.pays !== 'monde' && !c.pays.includes(criteres.pays)) return false
      if (criteres.secteur !== undefined && c.secteurs !== 'tous' && !c.secteurs.includes(criteres.secteur)) {
        return false
      }
      return true
    })
  }

  /**
   * Récolte en parallèle. Une source qui échoue DÉGRADE SA PROPRE couverture
   * et n'entraîne jamais les autres : c'est la seule façon d'ajouter une
   * dixième source sans rendre le produit dix fois plus fragile.
   */
  async balayer(
    connecteurs: readonly Connecteur[],
    ctx: ContexteRecolte,
    maintenant: () => number = () => Date.now(),
  ): Promise<Balayage> {
    const resultats = await Promise.all(
      connecteurs.map(async (c): Promise<ResultatSource> => {
        const debut = maintenant()
        try {
          const r = await c.recolter(ctx)
          return {
            connecteur: c.id,
            palier: c.palier,
            etat: r.etat,
            offres: r.offres,
            latenceAttendueSecondes: c.latenceAttendueSecondes,
            dureeMs: maintenant() - debut,
            ...(r.note === undefined ? {} : { note: r.note }),
          }
        } catch (cause) {
          // Une exception non prévue est un état AVEUGLE, jamais un « rien
          // trouvé ». Le message n'est pas conservé ici : il partirait dans un
          // journal, et le contenu d'une source est du texte non fiable.
          return {
            connecteur: c.id,
            palier: c.palier,
            etat: 'erreur',
            offres: [],
            latenceAttendueSecondes: c.latenceAttendueSecondes,
            dureeMs: maintenant() - debut,
            note: cause instanceof Error ? cause.name : 'inconnue',
          }
        }
      }),
    )

    return {
      resultats,
      sourcesAffirmables: resultats.filter((r) => couvertureAffirmable(r.etat)).map((r) => r.connecteur),
      sourcesAveugles: resultats.filter((r) => !couvertureAffirmable(r.etat)).map((r) => r.connecteur),
    }
  }
}

/**
 * La phrase que l'interface a le droit de dire, et rien de plus.
 *
 * REQ-003 : « Un échec n'est JAMAIS présenté comme une absence d'offres. »
 * Cette fonction existe pour qu'aucun écran n'ait à s'en souvenir.
 */
export function formulerCouverture(b: Balayage): string {
  const total = b.resultats.reduce((n, r) => n + r.offres.length, 0)
  if (b.sourcesAveugles.length === 0) {
    return total === 0
      ? "Rien ne correspondait. J'ai regardé partout où je sais regarder."
      : `${total} offre(s), sur ${b.sourcesAffirmables.length} source(s) consultée(s).`
  }
  const manquantes = b.sourcesAveugles.length
  return total === 0
    ? `Rien trouvé pour l'instant, mais ${manquantes} source(s) ne m'ont pas répondu : je ne peux pas dire qu'il n'y a rien.`
    : `${total} offre(s) trouvée(s). ${manquantes} source(s) ne m'ont pas répondu — il en manque peut-être.`
}
