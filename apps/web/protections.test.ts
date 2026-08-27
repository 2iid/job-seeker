import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La liste des écrans protégés existe à TROIS endroits : le middleware, le
 * garde de chaque page, et la boucle du smoke. Trois copies d'une même vérité
 * divergent — c'est une question de temps, pas de sérieux.
 *
 * Ce test lie les deux premières. La troisième est du shell, hors de portée
 * d'ici ; le smoke porte sa propre consigne en commentaire, et l'écart y serait
 * visible parce qu'il est écrit sur une seule ligne.
 */
const APP = new URL('./app/', import.meta.url).pathname
const MIDDLEWARE = readFileSync(new URL('./middleware.ts', import.meta.url).pathname, 'utf8')

/** Les pages qui se gardent elles-mêmes, avec leur route. */
function pagesGardees(dossier = APP, prefixe = ''): string[] {
  const out: string[] = []
  for (const e of readdirSync(dossier)) {
    if (e === 'node_modules' || e === '.next') continue
    const chemin = join(dossier, e)
    if (statSync(chemin).isDirectory()) {
      // Un segment dynamique n'ajoute rien à la route protégée : c'est son
      // parent qui l'est.
      out.push(...pagesGardees(`${chemin}/`, e.startsWith('[') ? prefixe : `${prefixe}/${e}`))
    } else if (e === 'page.tsx') {
      const src = readFileSync(chemin, 'utf8')
      if (src.includes("redirect('/connexion")) out.push(prefixe === '' ? '/' : prefixe)
    }
  }
  return out
}

describe('les écrans protégés et le middleware disent la même chose', () => {
  it('trouve bien des pages gardées', () => {
    // Un test qui n'en trouve aucune passerait toujours.
    expect(pagesGardees().length).toBeGreaterThan(4)
  })

  it('chaque page qui renvoie vers la connexion figure dans PROTEGES', () => {
    // Une page absente de la liste se rend d'abord et redirige ensuite : un
    // écran vide qui clignote, et une requête de rendu faite pour rien.
    const liste = /const PROTEGES = \[([^\]]*)\]/s.exec(MIDDLEWARE)?.[1] ?? ''
    const prefixes = [...liste.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '')
    expect(prefixes.length).toBeGreaterThan(4)

    const manquantes = pagesGardees().filter(
      (route) => !prefixes.some((p) => route === p || route.startsWith(`${p}/`)),
    )
    expect(manquantes, 'page(s) gardées mais absentes de PROTEGES').toEqual([])
  })
})
