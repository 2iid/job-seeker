import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * « Une valeur codée en dur dans un composant est signalée » — critère de JOB-011.
 *
 * Le système de design n'est la source unique de vérité que si rien ne peut le
 * contourner en silence. Ce test parcourt le produit et refuse toute couleur
 * littérale hors des deux endroits qui ont le droit d'en contenir : la source
 * des tokens, et la feuille qu'elle engendre.
 */

const RACINE = join(import.meta.dirname, '..', '..')

const SCANNES = ['apps/web/app', 'apps/web/components', 'packages/ui/src']
const EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.jsx', '.js'])

/** Les seuls fichiers autorisés à porter une valeur littérale. */
const AUTORISES = new Set([
  'packages/ui/src/tokens.ts', // la source du système
  'packages/ui/src/tokens.test.ts', // les bornes connues du calcul WCAG
])

const HEX = /#[0-9A-Fa-f]{3,8}\b/g
const FONCTIONS_COULEUR = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\s*\(/g

function fichiers(dir: string): string[] {
  const abs = join(RACINE, dir)
  let entrees: string[]
  try {
    entrees = readdirSync(abs)
  } catch {
    return []
  }
  return entrees.flatMap((e) => {
    const chemin = join(abs, e)
    if (statSync(chemin).isDirectory()) return fichiers(join(dir, e))
    return EXTENSIONS.has(extname(e)) ? [relative(RACINE, chemin)] : []
  })
}

describe('le système de design est la source unique', () => {
  const cibles = SCANNES.flatMap(fichiers).filter((f) => !AUTORISES.has(f))

  it('parcourt réellement des fichiers', () => {
    // Sans cela, un renommage de dossier ferait passer ce test en scannant rien.
    expect(cibles.length, 'aucun fichier scanné — les chemins ont-ils changé ?').toBeGreaterThan(3)
  })

  it.each(cibles)('%s ne code aucune couleur en dur', (f) => {
    const contenu = readFileSync(join(RACINE, f), 'utf8')
    const trouves = [...(contenu.match(HEX) ?? []), ...(contenu.match(FONCTIONS_COULEUR) ?? [])]
    expect(
      trouves,
      `${f} contient ${trouves.join(', ')} — employez une variable du système (var(--…)) ou un token de @job-seeker/ui`,
    ).toEqual([])
  })
})
