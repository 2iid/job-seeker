import { describe, expect, it } from 'vitest'
import { adresseAppelante, INCONNUE, lireRelais } from './adresse-ip.ts'

const h = (o: Record<string, string>) => new Headers(o)

describe('lireRelais', () => {
  it('accepte un entier positif', () => {
    expect(lireRelais('1')).toBe(1)
    expect(lireRelais('3')).toBe(3)
    expect(lireRelais('0')).toBe(0)
  })

  it('ramène à zéro tout ce qui n’est pas un entier positif', () => {
    // `Number('abc') < 1` vaut FALSE — toute comparaison avec NaN est fausse.
    // Une déclaration absurde passait donc le contrôle et ne finissait par
    // être sans danger que par accident. Ici c'est décidé, pas subi.
    for (const brut of ['abc', '', '-1', '1.5', 'Infinity', '1e400'])
      expect(lireRelais(brut), brut).toBe(0)
  })
})

describe('adresseAppelante — sans proxy déclaré (0 relais)', () => {
  it('IGNORE x-forwarded-for : sans proxy, personne de confiance ne l’écrit', () => {
    expect(adresseAppelante(h({ 'x-forwarded-for': '1.2.3.4' }), 0)).toBe(INCONNUE)
  })

  it('ignore aussi les en-têtes d’hébergeur, qui ne valent que derrière eux', () => {
    expect(adresseAppelante(h({ 'cf-connecting-ip': '1.2.3.4' }), 0)).toBe(INCONNUE)
    expect(adresseAppelante(h({ 'x-real-ip': '1.2.3.4' }), 0)).toBe(INCONNUE)
  })
})

describe('adresseAppelante — un relais de confiance', () => {
  it('prend la DERNIÈRE entrée, celle qu’a écrite notre propre relais', () => {
    // LE test de ce fichier. `[0]` rendrait '9.9.9.9' — la valeur forgée par
    // l'appelant — et donnerait un quota neuf à chaque requête.
    expect(adresseAppelante(h({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }), 1)).toBe('203.0.113.7')
  })

  it('n’est pas dupée par une chaîne forgée, même longue', () => {
    const forge = '1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.7'
    expect(adresseAppelante(h({ 'x-forwarded-for': forge }), 1)).toBe('203.0.113.7')
  })

  it('tolère les espaces et les entrées vides', () => {
    expect(adresseAppelante(h({ 'x-forwarded-for': ' 9.9.9.9 ,, 203.0.113.7 ' }), 1)).toBe('203.0.113.7')
  })

  it('préfère l’en-tête à valeur unique de l’hébergeur quand elle existe', () => {
    expect(
      adresseAppelante(h({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '9.9.9.9' }), 1),
    ).toBe('203.0.113.9')
  })

  it('rend « inconnue » plutôt que rien quand aucune en-tête n’est posée', () => {
    expect(adresseAppelante(h({}), 1)).toBe(INCONNUE)
  })
})

describe('adresseAppelante — deux relais de confiance', () => {
  it('remonte de deux crans depuis la droite', () => {
    expect(
      adresseAppelante(h({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7, 10.0.0.1' }), 2),
    ).toBe('203.0.113.7')
  })

  it('REFUSE plutôt que de se rabattre quand la chaîne est trop courte', () => {
    // Se rabattre sur `[0]` ici rendrait la valeur contrôlée par l'appelant —
    // c'est-à-dire exactement le défaut qu'on évite, ressuscité par le repli.
    expect(adresseAppelante(h({ 'x-forwarded-for': '9.9.9.9' }), 2)).toBe(INCONNUE)
  })
})
