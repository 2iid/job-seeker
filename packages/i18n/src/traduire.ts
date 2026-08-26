/**
 * Traduire, et refuser de faire semblant.
 *
 * Une clé inconnue ne rend pas une chaîne vide et ne se rabat pas
 * silencieusement sur le français : elle rend la CLÉ elle-même. Une chaîne vide
 * disparaît dans la mise en page et personne ne la voit ; un repli silencieux
 * met un mot français dans un écran anglais et personne ne le voit non plus.
 * La clé, elle, se remarque immédiatement — et c'est exactement ce qu'on veut
 * d'un défaut de traduction.
 *
 * (Le typage rend ce cas presque impossible depuis TypeScript. « Presque » :
 * une clé peut venir d'une donnée, et c'est là que ça compte.)
 */

import type { Cle } from './cles.ts'
import { fr } from './fr.ts'
import { en } from './en.ts'

export type Locale = 'fr' | 'en'

export type Parametres = Readonly<Record<string, string | number>>

const DICTIONNAIRES: Record<Locale, Record<string, string>> = { fr, en }

/**
 * Remplit les `{trous}`.
 *
 * Un trou dont le paramètre manque est laissé TEL QUEL, accolades comprises.
 * L'effacer donnerait « il y a  min », une phrase qui a l'air correcte et qui
 * a perdu son information — la version la plus coûteuse de l'erreur, parce
 * qu'elle passe la relecture.
 */
export function remplir(modele: string, params: Parametres = {}): string {
  return modele.replace(/\{(\w+)\}/g, (entier, nom: string) => {
    const v = params[nom]
    return v === undefined ? entier : String(v)
  })
}

export function traduire(cle: Cle, locale: Locale, params?: Parametres): string {
  const modele = DICTIONNAIRES[locale][cle]
  if (modele === undefined) return cle
  return remplir(modele, params)
}

/** Un traducteur lié à une langue — ce qu'un composant reçoit. */
export type Traducteur = (cle: Cle, params?: Parametres) => string

export function creerTraducteur(locale: Locale): Traducteur {
  return (cle, params) => traduire(cle, locale, params)
}

/** Les deux langues du produit, dans l'ordre où elles ont été conçues. */
export const LOCALES: readonly Locale[] = ['fr', 'en']

/**
 * La langue à servir, à partir de l'en-tête `Accept-Language`.
 *
 * Le français est le défaut, et pas seulement parce que c'est la langue de
 * référence : servir de l'anglais à quelqu'un dont on n'a pas compris la
 * demande est plus dommageable que l'inverse pour ce produit-ci.
 */
export function localeDepuisEnTete(acceptLanguage: string | null): Locale {
  if (acceptLanguage === null) return 'fr'
  const premiere = acceptLanguage
    .split(',')
    .map((p) => {
      const [etiquette, q] = p.trim().split(';q=')
      return { etiquette: (etiquette ?? '').toLowerCase(), q: q === undefined ? 1 : Number(q) }
    })
    .filter((p) => Number.isFinite(p.q))
    .sort((a, b) => b.q - a.q)
    .find((p) => p.etiquette.startsWith('fr') || p.etiquette.startsWith('en'))
  return premiere?.etiquette.startsWith('en') === true ? 'en' : 'fr'
}
