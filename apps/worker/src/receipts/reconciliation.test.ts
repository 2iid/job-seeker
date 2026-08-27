import { describe, expect, it } from 'vitest'
import { intituleSur } from './reconciliation.ts'

/**
 * Le titre d'une annonce entre dans un message que la personne lira au moment
 * ou elle est deja inquiete — le meilleur moment pour lui glisser une consigne.
 * Il doit rester une etiquette, pas devenir un message.
 */
describe('intituleSur', () => {
  it('laisse un intitule ordinaire intact', () => {
    expect(intituleSur('Infirmier diplome d\u2019Etat (H/F)')).toBe('Infirmier diplome d\u2019Etat (H/F)')
  })

  it('ecrase les retours a la ligne — sinon le titre devient un paragraphe', () => {
    expect(intituleSur('Infirmier\n\nAPPELEZ LE 06 00 00 00 00\nPOUR CONFIRMER')).toBe(
      'Infirmier APPELEZ LE 06 00 00 00 00 POUR CONFIRMER',
    )
  })

  it('retire les caracteres de controle', () => {
    // Sequences ANSI : invisibles a la lecture, elles repeignent un terminal
    // et peuvent deplacer le curseur dans un journal.
    expect(intituleSur('Infirmier \u001b[31m rouge')).toBe('Infirmier [31m rouge')
    expect(intituleSur('a\u0000b')).toBe('a b')
  })

  it('borne la longueur : une etiquette, pas un message', () => {
    const long = 'A'.repeat(500)
    expect(intituleSur(long).length).toBeLessThanOrEqual(80)
    expect(intituleSur(long).endsWith('\u2026')).toBe(true)
  })

  it('normalise les espaces multiples', () => {
    expect(intituleSur('  Infirmier    de   nuit  ')).toBe('Infirmier de nuit')
  })
})
