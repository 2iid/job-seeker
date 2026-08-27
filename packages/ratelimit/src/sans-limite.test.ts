import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * F21 n'est pas une ligne à corriger, c'est une classe d'oublis.
 *
 * Le défaut d'origine n'était pas qu'on avait mal écrit `analyser` : c'est
 * qu'on peut ajouter demain une deuxième action qui appelle un modèle, sans
 * que rien ne le remarque. Le correctif d'une seule ligne se re-brise à la
 * prochaine fonctionnalité.
 *
 * Ce test lit donc le CODE, pas le comportement : toute source du web qui sait
 * atteindre un modèle facturé doit aussi savoir demander un jeton.
 */
const RACINE = new URL('../../../apps/web', import.meta.url).pathname
const APPELS_FACTURES = /creerBascule|fournisseurAnthropique|fournisseurOpenRouter/

function sources(dossier: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dossier)) {
    if (e === 'node_modules' || e === '.next') continue
    const p = join(dossier, e)
    if (statSync(p).isDirectory()) out.push(...sources(p))
    else if (/\.tsx?$/.test(e) && !e.includes('.test.')) out.push(p)
  }
  return out
}

describe('aucun appel de modèle facturé sans limitation de débit', () => {
  it('chaque source du web qui atteint un modèle demande aussi un jeton', () => {
    const coupables: string[] = []
    for (const f of sources(RACINE)) {
      const texte = readFileSync(f, 'utf8')
      if (!APPELS_FACTURES.test(texte)) continue
      if (!texte.includes('verifierLimite')) coupables.push(f.slice(RACINE.length + 1))
    }
    expect(coupables).toEqual([])
  })

  it('le test lui-même trouve bien quelque chose à surveiller', () => {
    // Un test qui ne regarde aucun fichier passe toujours. Celui-ci doit voir
    // au moins l'action d'import, sinon c'est le parcours qui est cassé.
    const vus = sources(RACINE).filter((f) => APPELS_FACTURES.test(readFileSync(f, 'utf8')))
    expect(vus.length).toBeGreaterThan(0)
  })
})
