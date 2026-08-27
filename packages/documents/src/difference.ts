/**
 * JOB-041 / REQ-007 — la différence, modification par modification.
 *
 * « La version adaptée s'affiche en différence face au CV maître, modification
 * par modification. Chaque modification peut être acceptée ou refusée
 * individuellement ; un refus est définitif pour cette candidature. »
 *
 * ── Pourquoi une différence par MOTS et non par lignes ──
 *
 * Une description de poste tient en trois phrases. Un diff de lignes rendrait
 * « toute la ligne a changé » sur un adjectif remplacé — c'est-à-dire qu'il
 * rendrait la relecture aussi coûteuse que réécrire soi-même, et la personne
 * accepterait en bloc. Le grain de la différence décide de ce qui est
 * réellement relu.
 *
 * ── Pourquoi le refus est DÉFINITIF pour cette candidature ──
 *
 * REQ-007 l'impose, et la raison n'est pas technique. Quelqu'un qui refuse une
 * reformulation vient de dire « ça, je ne le tiendrai pas en entretien ». Le
 * lui reproposer au prochain écran, ou le laisser revenir parce qu'on a
 * régénéré, transformerait son refus en un obstacle qu'on lui fait franchir
 * plusieurs fois — et à la troisième, il acceptera pour en finir.
 */

export type Segment =
  | { readonly type: 'garde'; readonly texte: string }
  | { readonly type: 'ajoute'; readonly texte: string }
  | { readonly type: 'retire'; readonly texte: string }

/**
 * Une modification isolée, acceptable ou refusable seule.
 *
 * `id` est stable pour un couple (origine, proposition) : il vient de la
 * position, et deux exécutions de la même différence rendent les mêmes
 * identifiants. C'est ce qui permet de conserver un refus.
 */
export type Modification = {
  readonly id: string
  readonly retire: string
  readonly ajoute: string
}

/**
 * Découpe en mots, séparateurs ET ponctuation, pour tout recomposer sans perte.
 *
 * La ponctuation est détachée du mot, et ce n'est pas un détail de forme.
 * Collée, « agences. » et « agences » sont deux jetons différents : remplacer
 * « trois agences. » par « trois agences externes. » faisait alors apparaître
 * « agences. » comme retiré et « agences externes. » comme ajouté, alors qu'un
 * seul mot est venu s'intercaler.
 *
 * Le grain de la différence décide de ce qui est réellement relu. Une
 * différence trop grossière rend la relecture aussi coûteuse que la réécriture,
 * et quelqu'un qui doit relire vingt fois finit par accepter en bloc — ce qui
 * annule tout l'intérêt de REQ-007.
 */
function jetons(texte: string): string[] {
  return texte.split(/(\s+)|([.,;:!?()«»"'\u2019])/u).filter((j) => j !== undefined && j !== '')
}

/**
 * Plus longue sous-séquence commune, par mots.
 *
 * Implémentation directe, en O(n·m). Une description de poste fait quelques
 * dizaines de mots : y poser un algorithme plus fin coûterait en lisibilité ce
 * qu'il ferait gagner en microsecondes, sur un code dont la justesse compte
 * bien plus que la vitesse.
 */
function plusLongueCommune(a: readonly string[], b: readonly string[]): number[][] {
  const t: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      t[i]![j] = a[i] === b[j] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!)
    }
  }
  return t
}

export function segmenter(origine: string, propose: string): readonly Segment[] {
  const a = jetons(origine)
  const b = jetons(propose)
  const t = plusLongueCommune(a, b)
  const segments: Segment[] = []

  const pousser = (type: Segment['type'], texte: string): void => {
    const dernier = segments[segments.length - 1]
    if (dernier !== undefined && dernier.type === type) {
      segments[segments.length - 1] = { type, texte: dernier.texte + texte }
    } else {
      segments.push({ type, texte } as Segment)
    }
  }

  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { pousser('garde', a[i]!); i += 1; j += 1 }
    else if (t[i + 1]![j]! >= t[i]![j + 1]!) { pousser('retire', a[i]!); i += 1 }
    else { pousser('ajoute', b[j]!); j += 1 }
  }
  while (i < a.length) { pousser('retire', a[i]!); i += 1 }
  while (j < b.length) { pousser('ajoute', b[j]!); j += 1 }

  return segments
}

/**
 * Les modifications isolables d'une différence.
 *
 * Un retrait suivi d'un ajout est UNE modification (un remplacement), pas
 * deux : les présenter séparément demanderait d'accepter une suppression sans
 * voir ce qui vient à la place, ce qui n'est pas une décision qu'on peut
 * prendre.
 */
export function modifications(segments: readonly Segment[]): readonly Modification[] {
  const mods: Modification[] = []
  let i = 0
  while (i < segments.length) {
    const s = segments[i]!
    if (s.type === 'garde') { i += 1; continue }
    const suivant = segments[i + 1]
    if (s.type === 'retire' && suivant?.type === 'ajoute') {
      mods.push({ id: `m${mods.length}`, retire: s.texte, ajoute: suivant.texte })
      i += 2
    } else if (s.type === 'retire') {
      mods.push({ id: `m${mods.length}`, retire: s.texte, ajoute: '' })
      i += 1
    } else {
      mods.push({ id: `m${mods.length}`, retire: '', ajoute: s.texte })
      i += 1
    }
  }
  return mods
}

/**
 * Recompose le texte en n'appliquant que les modifications ACCEPTÉES.
 *
 * Une modification refusée rend le texte d'origine — pas un vide, pas la
 * proposition atténuée. Refuser, c'est revenir à ce que la personne avait
 * écrit elle-même.
 */
export function appliquer(
  segments: readonly Segment[],
  refusees: ReadonlySet<string>,
): string {
  let sortie = ''
  let rang = 0
  let i = 0
  while (i < segments.length) {
    const s = segments[i]!
    if (s.type === 'garde') { sortie += s.texte; i += 1; continue }
    const suivant = segments[i + 1]
    const id = `m${rang}`
    rang += 1
    if (s.type === 'retire' && suivant?.type === 'ajoute') {
      sortie += refusees.has(id) ? s.texte : suivant.texte
      i += 2
    } else if (s.type === 'retire') {
      sortie += refusees.has(id) ? s.texte : ''
      i += 1
    } else {
      sortie += refusees.has(id) ? '' : s.texte
      i += 1
    }
  }
  return sortie
}

/** La différence complète d'un champ, prête pour l'écran. */
export type DifferenceChamp = {
  readonly champ: string
  readonly segments: readonly Segment[]
  readonly modifications: readonly Modification[]
}

export function differencier(champ: string, origine: string, propose: string): DifferenceChamp {
  const segments = segmenter(origine, propose)
  return { champ, segments, modifications: modifications(segments) }
}
