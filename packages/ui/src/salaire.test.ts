import { describe, expect, it } from 'vitest'
import { exposant, formaterSalaire } from './salaire'

const eur = { min: 4_500_000, max: 5_500_000, devise: 'EUR', periode: 'an' as const }

describe('formaterSalaire', () => {
  it('affiche la devise de l’offre en premier — c’est ce qui sera payé', () => {
    const s = formaterSalaire(eur)!
    expect(s.origine).toMatch(/45\s?000/)
    expect(s.origine).toMatch(/55\s?000/)
    expect(s.origine).toContain('/ an')
  })

  it('n’invente pas de conversion sans taux', () => {
    // Un montant converti à un taux inconnu est une information fausse
    // présentée comme une aide.
    const s = formaterSalaire(eur)!
    expect(s.converti).toBeNull()
    expect(s.mentionTaux).toBeNull()
  })

  it('identifie la conversion COMME TELLE, avec sa date', () => {
    // « ≈ 68 000 € » sans marque se lit comme une donnée de l'offre. Le jour où
    // le taux bouge, c'est l'employeur qu'on accusera d'avoir menti.
    const s = formaterSalaire(eur, { taux: { vers: 'XOF', valeur: 655.957, le: '2026-08-20T00:00:00Z' } })!
    expect(s.converti).toMatch(/^≈/)
    expect(s.mentionTaux).toBe('taux du 2026-08-20')
  })

  it('ne convertit pas vers la devise de l’offre elle-même', () => {
    const s = formaterSalaire(eur, { taux: { vers: 'eur', valeur: 1, le: '2026-08-20' } })!
    expect(s.converti).toBeNull()
  })

  it('respecte les devises SANS sous-unité', () => {
    // 1 200 000 francs CFA sont 1 200 000, pas 12 000. Diviser par cent
    // afficherait un centième du salaire — l'offre paraîtrait dérisoire.
    expect(exposant('XOF')).toBe(0)
    const s = formaterSalaire({ min: 1_200_000, max: null, devise: 'XOF', periode: 'mois' })!
    expect(s.origine).toMatch(/1\s?200\s?000/)
  })

  it('réajuste l’échelle entre une devise à sous-unité et une sans', () => {
    // 4 500 000 centimes d'euro ne sont pas 4 500 000 francs CFA. Sans
    // réajustement, la conversion se trompe d'un facteur cent.
    const s = formaterSalaire(
      { min: 4_500_000, max: null, devise: 'EUR', periode: 'an' },
      { taux: { vers: 'XOF', valeur: 655.957, le: '2026-08-20' } },
    )!
    // 45 000 € au taux fixe du franc CFA font 29 518 065 F CFA, pas
    // 2 951 806 500 — l'écart est exactement le facteur cent.
    expect(s.converti?.replace(/[\s\u202f\u00a0]/g, '')).toBe('≈29518065FCFA/an')
  })

  it('et dans l’autre sens : sans sous-unité vers avec', () => {
    const s = formaterSalaire(
      { min: 1_200_000, max: null, devise: 'XOF', periode: 'mois' },
      { taux: { vers: 'EUR', valeur: 1 / 655.957, le: '2026-08-20' } },
    )!
    // 1 200 000 F CFA ≈ 1 829 €, pas 18 € ni 182 900 €.
    expect(s.converti?.replace(/[\s\u202f\u00a0]/g, '')).toBe('≈1829€/mois')
  })

  it('une borne unique ne s’affiche pas comme une plage', () => {
    const s = formaterSalaire({ min: 4_500_000, max: 4_500_000, devise: 'EUR', periode: 'an' })!
    expect(s.origine).not.toContain('–')
  })

  it('sans montant, il n’y a rien à afficher', () => {
    expect(formaterSalaire({ min: null, max: null, devise: 'EUR', periode: 'an' })).toBeNull()
  })

  it('n’affiche pas de centimes — un salaire s’annonce en entier', () => {
    const s = formaterSalaire(eur)!
    expect(s.origine).not.toMatch(/,00/)
  })
})
