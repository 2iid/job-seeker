/**
 * JOB-087 / JOB-090 — dire ce qu'on couvre VRAIMENT.
 *
 * Ce module existe à cause d'une mesure. `JOB-076` a relevé les trois sources
 * de palier B contre cinq profils contrastés : trois sur cinq — un infirmier à
 * Nantes, un comptable à Lyon, un enseignant à Bogotá — ont obtenu **zéro**
 * offre pertinente. Les trois sources avaient répondu `ok`. Sur 393 offres :
 * 151 aux États-Unis, zéro en Afrique, zéro en Amérique du Sud hors Mexique.
 *
 * ── La distinction qui porte tout ──
 *
 * Un connecteur DÉCLARE `pays: 'monde'`. C'est une affirmation : elle dit que
 * la source n'a pas de frontière contractuelle. Elle ne dit rien de ce qu'on y
 * trouve, et la mesure a montré l'écart.
 *
 * Ce qu'on a le droit d'annoncer, c'est ce qu'on a OBSERVÉ. Une portée
 * déclarée est une promesse du fournisseur ; une portée observée est un fait
 * relevé chez nous.
 *
 * ── Le refus qui donne son sens au reste ──
 *
 * REQ-003 : « un échec n'est jamais présenté comme une absence d'offres ». Ce
 * module étend la règle d'un cran : une absence de SOURCE n'est jamais
 * présentée comme une absence d'offres non plus.
 *
 * « Aucune offre ne correspond » et « aucune source ne couvre ce que vous
 * cherchez » sont deux phrases différentes, et l'infirmier de Nantes n'a aucun
 * moyen de faire la différence si on ne la lui dit pas. La première le renvoie
 * à son profil ; la seconde nous renvoie à notre travail.
 */

export type Palier = 'a' | 'b' | 'c'

/** Ce qu'une source a RÉELLEMENT rendu, pas ce qu'elle déclare. */
export type Observation = {
  readonly source: string
  readonly palier: Palier
  /** Codes pays effectivement rencontrés dans ses offres. */
  readonly paysObserves: readonly string[]
  /** Nombre d'offres relevées. Zéro compte : une source muette est une source. */
  readonly offres: number
  /** Portée DÉCLARÉE par le connecteur, gardée pour pouvoir montrer l'écart. */
  readonly paysDeclares: readonly string[] | 'monde'
}

export type Cible = {
  /** Le pays où la personne cherche, ou `null` si elle ne l'a pas dit. */
  readonly pays: string | null
  /** Accepte-t-elle du distanciel ? Cela change tout ce qui suit. */
  readonly accepteDistanciel: boolean
}

export type Verdict = {
  /** Sources ayant réellement rendu des offres dans le pays visé. */
  readonly sourcesCouvrantes: readonly string[]
  /** Sources interrogées, tous pays confondus. */
  readonly sourcesInterrogees: number
  /** Vrai si AUCUNE source n'a jamais rendu d'offre dans ce pays. */
  readonly aucuneSourceLocale: boolean
  /** L'écart entre ce qui est déclaré et ce qui est observé, s'il existe. */
  readonly ecartDeclare: readonly { source: string; declare: string; observe: string }[]
}

const PAYS_DISTANCIEL = 'REMOTE'

export function evaluer(
  observations: readonly Observation[],
  cible: Cible,
): Verdict {
  const pays = cible.pays?.toUpperCase() ?? null

  const sourcesCouvrantes = observations
    .filter((o) => {
      if (o.offres === 0) return false
      if (pays === null) return true
      if (o.paysObserves.map((p) => p.toUpperCase()).includes(pays)) return true
      // Une source qui ne rend que du distanciel « couvre » quelqu'un qui
      // accepte le distanciel, où qu'il soit — c'est même sa raison d'être.
      return cible.accepteDistanciel && o.paysObserves.map((p) => p.toUpperCase()).includes(PAYS_DISTANCIEL)
    })
    .map((o) => o.source)

  const ecartDeclare = observations.flatMap((o) => {
    if (o.paysDeclares !== 'monde') return []
    // Une source qui se déclare mondiale et n'a jamais rendu d'offre dans le
    // pays visé : l'écart est exactement ce que JOB-076 a mesuré.
    if (pays === null || o.paysObserves.map((p) => p.toUpperCase()).includes(pays)) return []
    return [{
      source: o.source,
      declare: 'monde',
      observe: o.paysObserves.length === 0 ? 'aucun pays' : o.paysObserves.slice(0, 4).join(', '),
    }]
  })

  return {
    sourcesCouvrantes,
    sourcesInterrogees: observations.length,
    aucuneSourceLocale: pays !== null && sourcesCouvrantes.length === 0,
    ecartDeclare,
  }
}

/**
 * Ce que l'écran dit quand le flux est vide.
 *
 * Deux phrases très différentes, et le produit doit choisir la bonne :
 *
 *   « Je n'ai rien trouvé qui vous corresponde » — j'ai regardé au bon endroit,
 *   il n'y avait rien. C'est une information sur le marché.
 *
 *   « Je n'ai aucune source qui couvre ce que vous cherchez » — je n'ai pas
 *   regardé au bon endroit. C'est une information sur MOI.
 *
 * Dire la première quand la seconde est vraie fait porter à la personne un
 * échec qui est le nôtre. C'est exactement ce que REQ-003 interdit, appliqué
 * non plus à une panne mais à une lacune.
 */
export function expliquerFluxVide(v: Verdict, cible: Cible): string {
  if (v.aucuneSourceLocale) {
    const ou = cible.pays === null ? 'là où vous cherchez' : `dans ce pays`
    return (
      `Je n’ai aucune source qui ait déjà rendu une offre ${ou}. Ce n’est pas une absence d’offres : ` +
      `c’est une lacune de ma couverture, et elle est de mon côté. ` +
      (cible.accepteDistanciel
        ? 'Les offres distancielles que je vois viennent surtout d’Amérique du Nord et d’Europe.'
        : 'Ouvrir le distanciel élargirait beaucoup ce que je peux voir.')
    )
  }
  if (v.sourcesCouvrantes.length === 0) {
    return (
      'Je n’ai interrogé aucune source utile pour cette recherche. Ce n’est pas une absence d’offres, ' +
      'c’est une absence de regard.'
    )
  }
  return (
    `J’ai regardé ${v.sourcesCouvrantes.length} source${v.sourcesCouvrantes.length > 1 ? 's' : ''} ` +
    `sur ${v.sourcesInterrogees}, et aucune n’avait d’offre correspondant à vos critères aujourd’hui. ` +
    'Je continue : les sources sont relevées en continu.'
  )
}

/**
 * Ce que le produit a le droit d'annoncer comme couverture — JOB-087.
 *
 * Jamais « mondiale, tous secteurs ». La mesure de `JOB-076` interdit cette
 * phrase tant qu'elle tient, et l'écrire quand même serait vendre une portée
 * qu'on n'a pas — ce qui est la seule chose qu'un produit d'agent autonome ne
 * peut pas se permettre : sa valeur entière repose sur le fait qu'on puisse le
 * croire.
 */
export function annoncerCouverture(observations: readonly Observation[]): string {
  const pays = new Set(
    observations.flatMap((o) => o.paysObserves.map((p) => p.toUpperCase())),
  )
  pays.delete(PAYS_DISTANCIEL)
  const distanciel = observations.some((o) =>
    o.paysObserves.map((p) => p.toUpperCase()).includes(PAYS_DISTANCIEL),
  )

  if (pays.size === 0 && !distanciel) {
    return 'Je n’ai encore rien relevé. Je ne peux donc rien vous promettre sur ma couverture.'
  }

  const liste = [...pays].sort().slice(0, 6).join(', ')
  const suite = pays.size > 6 ? ` et ${pays.size - 6} autres` : ''
  return (
    `Ce que je couvre aujourd’hui, constaté et non promis : ${pays.size} pays ` +
    `(${liste}${suite})${distanciel ? ', plus des offres distancielles' : ''}. ` +
    'Si votre marché n’y est pas, dites-le-moi — c’est ce qui décide de ce que j’ajoute ensuite.'
  )
}
