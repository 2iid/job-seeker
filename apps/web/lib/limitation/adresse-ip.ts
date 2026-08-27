import { readOptional } from '@job-seeker/env'

/**
 * L'adresse de l'appelant, telle qu'on peut HONNÊTEMENT la connaître.
 *
 * ── Le piège, et pourquoi il est retourné dans le mauvais sens partout ──
 *
 * `x-forwarded-for` est une LISTE que chaque relais complète en ajoutant à
 * DROITE. La première entrée est donc celle que le client a écrite lui-même —
 * et prendre `xff.split(',')[0]` est exactement le geste qui rend la limitation
 * décorative : il suffit d'envoyer un `X-Forwarded-For` différent à chaque
 * requête pour avoir un quota neuf à chaque fois.
 *
 * La seule entrée digne de foi est la N-ième EN PARTANT DE LA DROITE, où N est
 * le nombre de relais qu'on opère SOI-MÊME. Ce nombre n'est pas devinable
 * depuis le code : il dépend du déploiement. Il est donc déclaré, et une
 * déclaration absente ou absurde vaut « je ne sais pas », jamais « fais au
 * mieux ».
 */
export const RELAIS_DE_CONFIANCE = lireRelais(readOptional('RELAIS_DE_CONFIANCE', '1'))

/** Exportée pour être testée : une valeur malformée doit valoir zéro, pas NaN. */
export function lireRelais(brut: string): number {
  const n = Number(brut)
  return Number.isInteger(n) && n >= 0 ? n : 0
}

/**
 * Le nombre de relais est un PARAMÈTRE et non une lecture d'environnement, pour
 * que le comportement de chaque configuration soit testable sans truquer le
 * processus.
 */
export function adresseAppelante(entetes: Headers, relaisDeConfiance = RELAIS_DE_CONFIANCE): string {
  // Certains hébergeurs posent une en-tête à valeur unique, non concaténable,
  // qu'ils garantissent eux-mêmes. Quand elle existe, elle prime — mais elle ne
  // vaut que si l'on est bien derrière l'hébergeur en question.
  if (relaisDeConfiance >= 1) {
    const directe = entetes.get('cf-connecting-ip') ?? entetes.get('x-real-ip')
    if (directe !== null && directe.trim() !== '') return directe.trim()
  }

  // Zéro relais = aucun proxy devant l'application. Alors `x-forwarded-for`
  // n'est écrit par PERSONNE de confiance : c'est l'appelant qui l'a mis. Le
  // lire reviendrait à laisser chacun choisir son quota — pire que ne pas
  // limiter, puisque la limitation aurait l'air de fonctionner.
  if (relaisDeConfiance < 1) return INCONNUE

  const xff = entetes.get('x-forwarded-for')
  if (xff === null || xff.trim() === '') return INCONNUE

  const relais = xff.split(',').map((s) => s.trim()).filter((s) => s !== '')
  // Liste plus courte que le nombre de relais déclarés : la configuration est
  // fausse, ou quelqu'un a coupé la chaîne. On ne se rabat surtout PAS sur la
  // première entrée — c'est précisément celle que l'appelant contrôle.
  const index = relais.length - relaisDeConfiance
  return index < 0 ? INCONNUE : (relais[index] ?? INCONNUE)
}

/**
 * Tous les appelants dont on ne sait rien partagent UN seul compteur. C'est
 * volontairement sévère : un déploiement mal configuré doit se remarquer par
 * une limite qui serre, jamais par une limite qui s'efface.
 */
export const INCONNUE = 'inconnue'
