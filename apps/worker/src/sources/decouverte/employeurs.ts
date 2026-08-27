/**
 * JOB-088 — trouver des EMPLOYEURS, pas des offres.
 *
 * `JOB-076` a mesuré la lacune : un infirmier à Nantes, un comptable à Lyon,
 * un enseignant à Bogotá obtiennent zéro offre pertinente. La raison est
 * structurelle — nos sources sont des agrégateurs d'offres distancielles, et
 * un hôpital ne publie pas là.
 *
 * Le palier A répond à ce besoin : lire le board de l'employeur lui-même. Mais
 * il suppose de CONNAÎTRE l'employeur, et le registre est vide hors tech.
 * Trouver des offres et trouver des employeurs sont deux problèmes différents,
 * et le second n'avait aucune source.
 *
 * ── Pourquoi Wikidata ──
 *
 * C'est une base ouverte, interrogeable, qui sait répondre à « les hôpitaux de
 * France avec leur site officiel » ou « les cabinets comptables du Sénégal ».
 * Sa licence est CC0, son API publique et documentée, et elle n'interdit rien
 * de ce qu'on fait. Un annuaire commercial serait plus complet et
 * juridiquement inutilisable ; un moteur de recherche interrogé
 * automatiquement le serait aussi.
 *
 * Elle n'est pas exhaustive, et c'est acceptable : on cherche à AMORCER un
 * registre, pas à le compléter. Un hôpital découvert est un hôpital de plus
 * que zéro.
 */

export type Secteur = 'sante' | 'education' | 'finance' | 'public' | 'industrie' | 'commerce'

/**
 * Les classes Wikidata par secteur.
 *
 * Volontairement peu nombreuses et précises. Une classe trop large — « une
 * organisation » — rendrait des dizaines de milliers d'entités dont la plupart
 * n'embauchent pas, et noierait le signal dans du bruit qu'il faudrait ensuite
 * sonder une par une, à nos frais.
 */
const CLASSES: Readonly<Record<Secteur, readonly string[]>> = {
  sante: ['Q16917', 'Q4287745', 'Q31855'],          // hôpital, établissement médical, institut de recherche
  education: ['Q3918', 'Q9826', 'Q875538'],         // université, lycée, université publique
  finance: ['Q22687', 'Q806718', 'Q4830453'],       // banque, holding, entreprise
  public: ['Q327333', 'Q2659904'],                  // administration, organisme public
  industrie: ['Q4830453', 'Q1364732'],              // entreprise, entreprise industrielle
  commerce: ['Q4830453', 'Q507619'],                // entreprise, chaîne de magasins
}

export type EmployeurDecouvert = {
  readonly nom: string
  readonly site: string
  readonly secteur: Secteur
  readonly pays: string
  readonly source: 'wikidata'
  readonly identifiant: string
}

/** Correspondance code ISO → entité Wikidata, pour les marchés visés. */
const PAYS: Readonly<Record<string, string>> = {
  FR: 'Q142', SN: 'Q1041', CI: 'Q1008', MA: 'Q1028', CM: 'Q1009',
  BE: 'Q31', CH: 'Q39', CA: 'Q16', US: 'Q30', GB: 'Q145', DE: 'Q183',
  ES: 'Q29', PT: 'Q45', IT: 'Q38', BR: 'Q155', CO: 'Q739', MX: 'Q96',
  IN: 'Q668', TN: 'Q948', DZ: 'Q262',
}

export function paysSupportes(): readonly string[] {
  return Object.keys(PAYS)
}

export function requete(secteur: Secteur, pays: string, limite: number): string | null {
  const entite = PAYS[pays.toUpperCase()]
  if (entite === undefined) return null
  const classes = CLASSES[secteur].map((c) => `wd:${c}`).join(' ')
  // Deux choix qui viennent d'un échec de mesure, pas d'une préférence.
  //
  // `VALUES` plutôt qu'une union de motifs : la requête reste lisible et le
  // moteur de Wikidata la planifie mieux.
  //
  // Et `wdt:P31` SEUL, sans la traversée de sous-classes `/wdt:P279*`. Avec
  // elle, la requête dépassait le délai du service sur un grand pays — la
  // France a été refusée deux fois de suite. Un délai dépassé se présente chez
  // nous comme « aucun employeur trouvé », c'est-à-dire exactement comme la
  // lacune qu'on cherchait à mesurer : la mesure aurait confirmé son propre
  // défaut.
  return `SELECT DISTINCT ?e ?eLabel ?site WHERE {
  VALUES ?classe { ${classes} }
  ?e wdt:P31 ?classe .
  ?e wdt:P17 wd:${entite} .
  ?e wdt:P856 ?site .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
} LIMIT ${Math.min(500, Math.max(1, limite))}`
}

type ReponseSparql = {
  results?: { bindings?: { e?: { value?: string }; eLabel?: { value?: string }; site?: { value?: string } }[] }
}

export function lireReponse(
  charge: unknown,
  secteur: Secteur,
  pays: string,
): readonly EmployeurDecouvert[] {
  const r = charge as ReponseSparql
  const lignes = r?.results?.bindings
  if (!Array.isArray(lignes)) return []
  const vus = new Set<string>()
  return lignes.flatMap((b): EmployeurDecouvert[] => {
    const nom = b.eLabel?.value
    const site = b.site?.value
    const id = b.e?.value
    if (nom === undefined || site === undefined || id === undefined) return []
    // Un label Wikidata non traduit rend l'identifiant brut (« Q12345 ») : ce
    // n'est pas un nom d'employeur, et l'enregistrer polluerait le registre.
    if (/^Q\d+$/.test(nom)) return []
    let hote: string
    try { hote = new URL(site).hostname.toLowerCase() } catch { return [] }
    // Un même employeur peut apparaître deux fois (deux classes). On garde une
    // entrée par HÔTE : c'est lui qu'on sondera.
    if (vus.has(hote)) return []
    vus.add(hote)
    return [{ nom, site, secteur, pays: pays.toUpperCase(), source: 'wikidata', identifiant: id }]
  })
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export type Recolte =
  | { readonly ok: true; readonly employeurs: readonly EmployeurDecouvert[] }
  | { readonly ok: false; readonly etat: 'injoignable' | 'refuse' | 'illisible'; readonly note: string }

export async function decouvrir(
  secteur: Secteur,
  pays: string,
  options: { fetch?: Fetch; limite?: number; contact?: string } = {},
): Promise<Recolte> {
  const q = requete(secteur, pays, options.limite ?? 50)
  if (q === null) {
    return { ok: false, etat: 'refuse', note: `pays ${pays} hors de la table de correspondance` }
  }
  const f = options.fetch ?? globalThis.fetch
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}`

  let reponse: Response
  try {
    reponse = await f(url, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        accept: 'application/sparql-results+json',
        // Wikidata EXIGE un agent identifiable avec un moyen de contact, et
        // coupe l'accès sans lui. Le déclarer n'est pas une politesse : c'est
        // la condition d'utilisation du service.
        'user-agent': `job-seeker/0.1 (${options.contact ?? 'contact non déclaré'})`,
      },
    })
  } catch {
    return { ok: false, etat: 'injoignable', note: 'service Wikidata injoignable' }
  }

  if (!reponse.ok) {
    return { ok: false, etat: 'refuse', note: `Wikidata a répondu ${reponse.status}` }
  }
  try {
    return { ok: true, employeurs: lireReponse(await reponse.json(), secteur, pays) }
  } catch {
    return { ok: false, etat: 'illisible', note: 'réponse SPARQL illisible' }
  }
}
