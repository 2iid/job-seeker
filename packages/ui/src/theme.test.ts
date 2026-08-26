import { describe, expect, it } from 'vitest'
import {
  CLE_STOCKAGE, SCRIPT_ANTI_CLIGNOTEMENT, attributHtml, estChoixValide, libelleSuivant, resoudre,
} from './theme'

describe('trois états, pas deux', () => {
  it('« comme mon système » est un choix à part entière', () => {
    // Un produit qui n'offre que deux boutons force un choix déjà fait
    // ailleurs, et cesse de le suivre quand l'utilisateur en change.
    expect(resoudre('systeme', true)).toBe('sombre')
    expect(resoudre('systeme', false)).toBe('clair')
  })

  it('un choix explicite l’emporte sur le système, dans les DEUX sens', () => {
    expect(resoudre('clair', true)).toBe('clair')
    expect(resoudre('sombre', false)).toBe('sombre')
  })

  it('le cycle revient toujours au système', () => {
    let c = libelleSuivant('systeme').suivant
    c = libelleSuivant(c).suivant
    expect(libelleSuivant(c).suivant).toBe('systeme')
  })

  it('le bouton dit ce qu’il FAIT, pas où l’on est', () => {
    expect(libelleSuivant('sombre').libelle).toMatch(/Suivre mon système/)
    expect(libelleSuivant('clair').libelle).toMatch(/Passer en sombre/)
  })

  it('refuse une valeur stockée qui n’est pas un choix', () => {
    for (const v of ['dark', '', null, undefined, 42, {}]) expect(estChoixValide(v)).toBe(false)
  })
})

describe('le script anti-clignotement', () => {
  it('applique le thème AVANT la première peinture, sans dépendance', () => {
    // Appliqué après l'hydratation, un utilisateur en sombre reçoit un éclair
    // blanc à chaque navigation. Sur un produit qu'on consulte la nuit, ce
    // n'est pas un détail esthétique.
    expect(SCRIPT_ANTI_CLIGNOTEMENT).toContain('data-theme')
    expect(SCRIPT_ANTI_CLIGNOTEMENT).toContain('prefers-color-scheme')
    expect(SCRIPT_ANTI_CLIGNOTEMENT.length, 'un script de démarrage doit rester minuscule').toBeLessThan(400)
  })

  it('survit à un stockage inaccessible', () => {
    // Navigation privée, cookies bloqués : la page doit s'afficher quand même.
    expect(SCRIPT_ANTI_CLIGNOTEMENT).toContain('try')
    expect(SCRIPT_ANTI_CLIGNOTEMENT).toContain('catch')
  })

  it('s’exécute réellement et pose le bon attribut', () => {
    const pose: string[] = []
    const faux = {
      localStorage: { getItem: () => 'sombre' },
      matchMedia: () => ({ matches: false }),
      document: { documentElement: { setAttribute: (_n: string, v: string) => pose.push(v) } },
    }
    new Function('localStorage', 'matchMedia', 'document', SCRIPT_ANTI_CLIGNOTEMENT)(
      faux.localStorage, faux.matchMedia, faux.document,
    )
    expect(pose).toEqual(['dark'])
  })

  it('retombe sur « système » quand le stockage contient n’importe quoi', () => {
    const pose: string[] = []
    new Function('localStorage', 'matchMedia', 'document', SCRIPT_ANTI_CLIGNOTEMENT)(
      { getItem: () => 'violet' },
      () => ({ matches: true }),
      { documentElement: { setAttribute: (_n: string, v: string) => pose.push(v) } },
    )
    expect(pose).toEqual(['dark'])
  })

  it('la clé de stockage est celle que le script lit', () => {
    expect(SCRIPT_ANTI_CLIGNOTEMENT).toContain(JSON.stringify(CLE_STOCKAGE))
  })
})

describe('la traduction vers l’attribut CSS n’a lieu qu’à un endroit', () => {
  it('sombre devient dark, clair devient light', () => {
    expect(attributHtml('sombre')).toBe('dark')
    expect(attributHtml('clair')).toBe('light')
  })
})
