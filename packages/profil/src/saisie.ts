/**
 * Lire ce que quelqu'un a tapé dans un champ libre.
 *
 * Deux fonctions, une règle commune : on normalise la FORME, jamais le SENS.
 * Ce qui est ambigu est refusé plutôt qu'interprété — ces valeurs pilotent la
 * veille et les rédhibitoires, et une interprétation optimiste s'y traduit en
 * offres manquées ou en candidatures parties de travers.
 */

/** Une liste séparée par des virgules, des points-virgules ou des retours à la ligne. */
export function listeDeSaisie(brut: string): string[] {
  return [
    ...new Set(
      brut
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter((s) => s !== ''),
    ),
  ]
}

/**
 * Un salaire, en unités mineures — la convention du projet pour toute somme.
 *
 * Rend `null` si le champ est vide, `'illisible'` si on n'en tire pas un
 * nombre. Le troisième cas n'est pas du zèle : « 45k » et « 45 000 € brut
 * annuel » se lisent, « environ 45 » ne se lit pas, et deviner 45 € ou 45 000 €
 * change le résultat par mille.
 */
export function montantEnUnitesMineures(brut: string): number | null | 'illisible' {
  const t = brut.trim()
  if (t === '') return null

  // « 45k », « 45 K€ » : le suffixe multiplie par mille.
  const millier = /^([\d\s.,]+)\s*k/i.exec(t)
  const corps = millier?.[1] ?? t
  const chiffres = corps.replace(/[^\d.,]/g, '').replace(/\s/g, '')
  if (chiffres === '') return 'illisible'

  // Séparateur décimal : le DERNIER point ou virgule s'il ne reste que deux
  // chiffres derrière. « 3.500 » est trois mille cinq cents, « 3.50 » est trois
  // cinquante — la position tranche, pas le caractère.
  const dernier = Math.max(chiffres.lastIndexOf('.'), chiffres.lastIndexOf(','))
  let unites: number
  if (dernier !== -1 && chiffres.length - dernier - 1 === 2) {
    const entier = chiffres.slice(0, dernier).replace(/[.,]/g, '')
    const decimales = chiffres.slice(dernier + 1)
    unites = Number(entier) * 100 + Number(decimales)
  } else {
    unites = Number(chiffres.replace(/[.,]/g, '')) * 100
  }

  if (!Number.isFinite(unites)) return 'illisible'
  return millier === null || millier === undefined ? unites : unites * 1000
}
