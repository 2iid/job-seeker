/**
 * JOB-038 — les filtres, et pourquoi ils vivent dans l'URL.
 *
 * Un filtre gardé dans un état de composant disparaît au rechargement, ne se
 * partage pas, et ne revient pas en arrière. Or un flux d'offres se consulte
 * en allers-retours : on ouvre une offre, on revient, on veut retrouver
 * exactement ce qu'on regardait. L'URL est le seul endroit qui tienne ces trois
 * promesses sans code.
 *
 * La persistance ENTRE SESSIONS, elle, demande davantage : c'est
 * `recherches_sauvegardees`, et le filtre marqué actif est celui que l'écran
 * rouvre quand on arrive sans paramètres.
 *
 * ── Ce qui est lu et ce qui est ignoré ──
 *
 * Tout paramètre inconnu est ignoré, et toute valeur hors du vocabulaire aussi.
 * Un filtre venu de l'URL est une entrée : accepter « palier=z » ne planterait
 * rien, mais produirait un flux vide qui se lirait « aucune offre » alors que
 * la vérité est « ce filtre ne veut rien dire ».
 */

export const PALIERS = ['a', 'b', 'c'] as const
export const STATUTS = [
  'detectee', 'en-file', 'escalade', 'envoyee', 'consultee', 'entretien',
  'sans-reponse', 'echec-technique', 'ecartee',
] as const

export type Filtres = {
  readonly paliers: readonly ('a' | 'b' | 'c')[]
  readonly statuts: readonly (typeof STATUTS)[number][]
  readonly scoreMin: number | null
  /** Masquer ce que l'agent ne peut pas envoyer seul. */
  readonly seulementSansBloquant: boolean
  readonly recherche: string
}

export const FILTRES_VIDES: Filtres = {
  paliers: [], statuts: [], scoreMin: null, seulementSansBloquant: false, recherche: '',
}

function liste<T extends string>(brut: string | undefined, vocabulaire: readonly T[]): T[] {
  if (brut === undefined || brut === '') return []
  return [...new Set(brut.split(',').map((v) => v.trim()))].filter((v): v is T =>
    (vocabulaire as readonly string[]).includes(v),
  )
}

export function lireFiltres(params: Record<string, string | string[] | undefined>): Filtres {
  const un = (c: string): string | undefined => {
    const v = params[c]
    return Array.isArray(v) ? v[0] : v
  }
  const score = Number(un('score'))
  return {
    paliers: liste(un('palier'), PALIERS),
    statuts: liste(un('statut'), STATUTS),
    // Un score hors de 0–100 est une erreur de saisie, pas un filtre : on
    // l'ignore plutôt que de rendre un flux vide inexplicable.
    scoreMin: Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score) : null,
    seulementSansBloquant: un('sansbloquant') === '1',
    // La recherche est bornée : une chaîne de dix mille caractères ne sert
    // qu'à faire travailler la base pour rien.
    recherche: (un('q') ?? '').trim().slice(0, 120),
  }
}

export function ecrireFiltres(f: Filtres): string {
  const p = new URLSearchParams()
  if (f.paliers.length > 0) p.set('palier', f.paliers.join(','))
  if (f.statuts.length > 0) p.set('statut', f.statuts.join(','))
  if (f.scoreMin !== null) p.set('score', String(f.scoreMin))
  if (f.seulementSansBloquant) p.set('sansbloquant', '1')
  if (f.recherche !== '') p.set('q', f.recherche)
  const s = p.toString()
  return s === '' ? '' : `?${s}`
}

export function estVide(f: Filtres): boolean {
  return (
    f.paliers.length === 0 && f.statuts.length === 0 && f.scoreMin === null &&
    !f.seulementSansBloquant && f.recherche === ''
  )
}

/** Combien de critères sont posés — ce que l'écran annonce à côté du bouton. */
export function compte(f: Filtres): number {
  return (
    f.paliers.length + f.statuts.length + (f.scoreMin === null ? 0 : 1) +
    (f.seulementSansBloquant ? 1 : 0) + (f.recherche === '' ? 0 : 1)
  )
}
