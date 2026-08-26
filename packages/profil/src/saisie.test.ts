import { describe, expect, it } from 'vitest'
import { listeDeSaisie, montantEnUnitesMineures } from './saisie.ts'

describe('listeDeSaisie', () => {
  it('accepte virgules, points-virgules et retours à la ligne', () => {
    expect(listeDeSaisie('Product Manager, Chef de projet;\nProduct Owner')).toEqual([
      'Product Manager', 'Chef de projet', 'Product Owner',
    ])
  })

  it('dédoublonne et ignore le vide', () => {
    expect(listeDeSaisie('PM,,  PM , ')).toEqual(['PM'])
  })

  it('ne touche PAS à la casse ni aux accents', () => {
    // Ce sont des intitulés de poste, pas des identifiants. « Chargée » n'est
    // pas « chargee », et le rendre à la personne différemment de ce qu'elle a
    // tapé lui ferait croire à une erreur de saisie.
    expect(listeDeSaisie('Chargée de Marketing')).toEqual(['Chargée de Marketing'])
  })
})

describe('montantEnUnitesMineures', () => {
  it('un champ vide est une absence, pas une erreur', () => {
    expect(montantEnUnitesMineures('')).toBeNull()
    expect(montantEnUnitesMineures('   ')).toBeNull()
  })

  it('lit un montant simple en unités mineures', () => {
    expect(montantEnUnitesMineures('45000')).toBe(4_500_000)
    expect(montantEnUnitesMineures('45 000 € brut annuel')).toBe(4_500_000)
  })

  it('le suffixe k multiplie par mille', () => {
    expect(montantEnUnitesMineures('45k')).toBe(4_500_000)
    expect(montantEnUnitesMineures('45 K€')).toBe(4_500_000)
  })

  it('la POSITION tranche le séparateur décimal, pas le caractère', () => {
    // « 3.500 » est trois mille cinq cents ; « 3.50 » est trois cinquante.
    // Se fier au point ou à la virgule se tromperait dans une moitié du monde.
    expect(montantEnUnitesMineures('3.500')).toBe(350_000)
    expect(montantEnUnitesMineures('3,50')).toBe(350)
    expect(montantEnUnitesMineures('1 234,56')).toBe(123_456)
  })

  it('refuse plutôt que de deviner', () => {
    // « environ 45 » : 45 € ou 45 000 € ? L'écart est de mille. Un refus qui
    // demande un nombre coûte un aller-retour ; une supposition coûte une
    // recherche entière menée sur le mauvais seuil.
    expect(montantEnUnitesMineures('environ')).toBe('illisible')
    expect(montantEnUnitesMineures('à négocier')).toBe('illisible')
  })
})
