/**
 * JOB-041 — l'état d'une révision de document, et ce qu'un refus y fait.
 *
 * Séparé de `difference.ts` parce que ce sont deux questions distinctes :
 * là-bas, « qu'est-ce qui a changé ? » ; ici, « qu'est-ce que la personne en a
 * décidé, et qu'est-ce qui part au bout du compte ? ».
 */

import { appliquer, differencier, type DifferenceChamp } from './difference.ts'

export type ChampRevisable = {
  readonly champ: string
  readonly origine: string
  readonly propose: string
}

export type Revision = {
  readonly differences: readonly DifferenceChamp[]
  /** Identifiants refusés, préfixés par le champ : `description:m0`. */
  readonly refusees: ReadonlySet<string>
}

/** Le préfixe évite qu'un `m0` d'un champ efface le `m0` d'un autre. */
export const cle = (champ: string, id: string): string => `${champ}:${id}`

export function preparer(champs: readonly ChampRevisable[], refusees: readonly string[] = []): Revision {
  return {
    differences: champs.map((c) => differencier(c.champ, c.origine, c.propose)),
    refusees: new Set(refusees),
  }
}

/** Le texte final de chaque champ, refus appliqués. */
export function resultat(r: Revision): Readonly<Record<string, string>> {
  const sortie: Record<string, string> = {}
  for (const d of r.differences) {
    const locales = new Set(
      [...r.refusees]
        .filter((k) => k.startsWith(`${d.champ}:`))
        .map((k) => k.slice(d.champ.length + 1)),
    )
    sortie[d.champ] = appliquer(d.segments, locales)
  }
  return sortie
}

export type Compte = {
  readonly total: number
  readonly refusees: number
  readonly acceptees: number
}

/** Ce que l'écran annonce en tête : combien reste-t-il à relire. */
export function compter(r: Revision): Compte {
  const total = r.differences.reduce((n, d) => n + d.modifications.length, 0)
  const refusees = r.differences.reduce(
    (n, d) => n + d.modifications.filter((m) => r.refusees.has(cle(d.champ, m.id))).length,
    0,
  )
  return { total, refusees, acceptees: total - refusees }
}

/**
 * Ajoute un refus. Ne retire jamais.
 *
 * Il n'existe pas de fonction « annuler un refus », et c'est délibéré :
 * REQ-007 dit « définitif pour cette candidature ». Offrir de revenir dessus
 * rouvrirait la porte que le refus vient de fermer — et transformerait une
 * décision en une préférence qu'on repose à chaque écran.
 */
export function refuser(r: Revision, champ: string, id: string): Revision {
  return { differences: r.differences, refusees: new Set([...r.refusees, cle(champ, id)]) }
}
