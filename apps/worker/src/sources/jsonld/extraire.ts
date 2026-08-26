/**
 * JOB-023 — sortir les blocs JSON-LD d'une page, sans lui faire confiance.
 *
 * Une page carrières est du HTML écrit par quelqu'un d'autre. Le JSON qu'on en
 * tire n'est pas une réponse d'API : c'est une entrée que rien ne contraint, et
 * dont l'auteur n'a aucune obligation envers nous. Trois protections, chacune
 * pour une façon précise de nous nuire.
 *
 * 1. **Une taille plafonnée par bloc et un nombre de blocs plafonné.** Une page
 *    peut porter mille blocs d'un mégaoctet. Le coût n'est pas le nôtre par
 *    hasard : c'est notre worker qui parse, et il a d'autres sources à relever.
 *
 * 2. **`__proto__` et `constructor` écartés à l'analyse.** `JSON.parse` accepte
 *    volontiers une clé `__proto__` ; l'affecter ensuite à un objet pollue le
 *    prototype de tout le processus. C'est une ligne de défense qui ne coûte
 *    rien et dont l'absence ne se voit qu'après.
 *
 * 3. **Un bloc illisible n'interrompt pas les autres.** Une page qui porte un
 *    JSON-LD cassé et trois valides doit rendre les trois. Abandonner sur le
 *    premier reviendrait à traiter le défaut d'un tiers comme une absence
 *    d'offres — ce que REQ-003 interdit.
 *
 * ── Pourquoi on s'arrête au premier `</script>` ──
 *
 * Parce que le navigateur fait pareil. La spécification HTML impose d'échapper
 * `<\/script>` à l'intérieur d'un bloc de script ; une page qui ne le fait pas
 * voit son propre bloc tronqué, chez nous comme chez tout le monde. Chercher
 * plus loin serait lire une donnée qu'aucun navigateur ne lirait — et donnerait
 * à une page hostile un moyen de nous faire interpréter ce que personne d'autre
 * n'interprète.
 */

/** 512 Ko : dix fois la taille d'un JobPosting bavard. Au-delà, ce n'est pas une offre. */
const TAILLE_MAX_BLOC = 512 * 1024
const BLOCS_MAX = 50

const SCRIPT_LD =
  /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi

const DANGEREUSES = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * `JSON.parse` avec les clés dangereuses écartées.
 *
 * Le reviver rend `undefined` pour ces clés, ce qui les SUPPRIME de l'objet
 * résultant. On ne lève pas : une page qui contient `__proto__` n'est pas
 * forcément malveillante, et refuser tout le bloc perdrait des offres réelles.
 */
export function analyserSansPollution(texte: string): unknown {
  return JSON.parse(texte, function reviver(cle: string, valeur: unknown) {
    return DANGEREUSES.has(cle) ? undefined : valeur
  })
}

export type BlocIgnore = { readonly raison: 'trop-gros' | 'illisible'; readonly octets: number }

export type Extraction = {
  readonly blocs: readonly unknown[]
  /** Ce qu'on n'a PAS lu. Compté, jamais silencieux — cf. REQ-003. */
  readonly ignores: readonly BlocIgnore[]
}

export function extraireJsonLd(html: string): Extraction {
  const blocs: unknown[] = []
  const ignores: BlocIgnore[] = []

  for (const m of html.matchAll(SCRIPT_LD)) {
    if (blocs.length + ignores.length >= BLOCS_MAX) break
    const brut = (m[1] ?? '').trim()
    if (brut === '') continue
    if (brut.length > TAILLE_MAX_BLOC) {
      ignores.push({ raison: 'trop-gros', octets: brut.length })
      continue
    }
    try {
      blocs.push(analyserSansPollution(brut))
    } catch {
      // Un bloc cassé n'interrompt pas les autres : une page qui en porte un
      // mauvais et trois bons doit rendre les trois.
      ignores.push({ raison: 'illisible', octets: brut.length })
    }
  }

  return { blocs, ignores }
}

/**
 * Aplatit ce que JSON-LD peut légitimement contenir.
 *
 * La spécification autorise, pour la même information : un objet, un tableau
 * d'objets, un objet portant `@graph`, et des imbrications des trois. Un
 * lecteur qui n'en gère qu'une forme lit correctement les pages d'un
 * générateur de site et rate celles de tous les autres — sans jamais échouer,
 * ce qui est le pire cas : la source paraît vide.
 */
export function aplatir(valeur: unknown, profondeur = 0): readonly Record<string, unknown>[] {
  // Une borne de profondeur, parce que `@graph` peut contenir `@graph`. Un
  // document construit pour ça ferait déborder la pile, et une pile qui
  // déborde arrête le worker, pas seulement cette source.
  if (profondeur > 6) return []
  if (Array.isArray(valeur)) return valeur.flatMap((v) => aplatir(v, profondeur + 1))
  if (typeof valeur !== 'object' || valeur === null) return []
  const o = valeur as Record<string, unknown>
  const graphe = o['@graph']
  if (graphe !== undefined) return aplatir(graphe, profondeur + 1)
  return [o]
}

/** `@type` peut être une chaîne ou un tableau. Les deux sont valides. */
export function aLeType(o: Record<string, unknown>, type: string): boolean {
  const t = o['@type']
  if (typeof t === 'string') return t.toLowerCase() === type.toLowerCase()
  if (Array.isArray(t)) return t.some((v) => typeof v === 'string' && v.toLowerCase() === type.toLowerCase())
  return false
}
