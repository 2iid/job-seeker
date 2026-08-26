import { describe, expect, it } from 'vitest'
import { compte, ecrireFiltres, estVide, FILTRES_VIDES, lireFiltres } from './filtres.ts'

describe('lireFiltres — l’URL est une entrée, pas une configuration', () => {
  it('lit ce qui est connu', () => {
    const f = lireFiltres({ palier: 'a,b', statut: 'en-file', score: '70', sansbloquant: '1', q: 'produit' })
    expect(f.paliers).toEqual(['a', 'b'])
    expect(f.statuts).toEqual(['en-file'])
    expect(f.scoreMin).toBe(70)
    expect(f.seulementSansBloquant).toBe(true)
    expect(f.recherche).toBe('produit')
  })

  it('ignore une valeur hors du vocabulaire', () => {
    // « palier=z » ne planterait rien, mais produirait un flux vide qui se
    // lirait « aucune offre » alors que la vérité est « ce filtre ne veut
    // rien dire ».
    expect(lireFiltres({ palier: 'z,a,999' }).paliers).toEqual(['a'])
    expect(lireFiltres({ statut: 'inconnu' }).statuts).toEqual([])
  })

  it('ignore un score hors de 0–100', () => {
    expect(lireFiltres({ score: '-5' }).scoreMin).toBeNull()
    expect(lireFiltres({ score: '500' }).scoreMin).toBeNull()
    expect(lireFiltres({ score: 'abc' }).scoreMin).toBeNull()
    expect(lireFiltres({ score: '0' }).scoreMin).toBe(0)
  })

  it('borne la recherche', () => {
    expect(lireFiltres({ q: 'x'.repeat(5000) }).recherche).toHaveLength(120)
  })

  it('dédoublonne', () => {
    expect(lireFiltres({ palier: 'a,a,a' }).paliers).toEqual(['a'])
  })

  it('un paramètre répété ne fait pas trébucher la lecture', () => {
    expect(lireFiltres({ palier: ['b', 'a'] }).paliers).toEqual(['b'])
  })
})

describe('aller-retour', () => {
  it('écrire puis relire rend les mêmes filtres', () => {
    const f = lireFiltres({ palier: 'a', statut: 'envoyee', score: '60', sansbloquant: '1', q: 'data' })
    const relu = lireFiltres(Object.fromEntries(new URLSearchParams(ecrireFiltres(f))))
    expect(relu).toEqual(f)
  })

  it('des filtres vides n’écrivent pas de point d’interrogation orphelin', () => {
    expect(ecrireFiltres(FILTRES_VIDES)).toBe('')
    expect(estVide(FILTRES_VIDES)).toBe(true)
  })

  it('compte les critères posés', () => {
    expect(compte(FILTRES_VIDES)).toBe(0)
    expect(compte(lireFiltres({ palier: 'a,b', score: '70', q: 'x' }))).toBe(4)
  })
})
