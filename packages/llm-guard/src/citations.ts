/**
 * Une citation est-elle VRAIMENT dans le texte qu'elle prétend citer ?
 *
 * La règle vit ici, en un seul exemplaire, parce qu'elle est appliquée à deux
 * endroits qui en tirent des conclusions OPPOSÉES — le score supprime ce qu'il
 * ne peut pas vérifier, l'extraction le signale — et que deux copies d'une même
 * règle finissent toujours par diverger sans que rien ne le signale. Ce qui
 * diverge alors, c'est la définition de « vérifié ».
 *
 * La comparaison est indulgente sur la FORME et stricte sur le FOND. Un modèle
 * qui recopie un passage change souvent la casse, les apostrophes typographiques
 * ou les espaces ; refuser pour ça rejetterait de vraies citations et
 * apprendrait à ignorer le signal. En revanche aucun mot n'est ajouté, retiré
 * ni remplacé : c'est ce qui distingue une citation d'une paraphrase, et une
 * paraphrase n'est pas une preuve.
 */

/** Casse, accents, guillemets, tirets, espaces — ce qui ne change pas le sens. */
export function comparable(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Vrai si `citation` figure mot pour mot dans `source`. Une citation vide est fausse. */
export function citationPresente(citation: string, source: string): boolean {
  const c = citation.trim()
  if (c === '') return false
  return comparable(source).includes(comparable(c))
}
