import { describe, expect, it } from 'vitest'
import {
  ageSecondes, annualiser, convertir, exposant, lirePublication, lireRemuneration,
  versDecimal, versUnitesMineures,
} from './normalisation.ts'

describe('l’argent ne passe jamais par un flottant', () => {
  it('toutes les devises n’ont pas deux décimales', () => {
    // Diviser un franc CFA par 100 produirait des centimes qui n'existent pas,
    // et un salaire dakarois affiché cent fois trop petit.
    expect(exposant('EUR')).toBe(2)
    expect(exposant('XOF')).toBe(0)
    expect(exposant('JPY')).toBe(0)
  })

  it('les unités mineures restent entières', () => {
    expect(versUnitesMineures(55_500.5, 'EUR')).toBe(5_550_050)
    expect(Number.isInteger(versUnitesMineures(1_200_000, 'XOF'))).toBe(true)
    expect(versUnitesMineures(1_200_000, 'XOF')).toBe(1_200_000)
  })

  it('l’aller-retour ne perd rien', () => {
    for (const [v, d] of [[62_000, 'EUR'], [1_200_000, 'XOF'], [78_500.25, 'CAD']] as const) {
      expect(versDecimal({ unitesMineures: versUnitesMineures(v, d), devise: d })).toBeCloseTo(v, 2)
    }
  })
})

describe('lireRemuneration — plutôt rien qu’un chiffre inventé', () => {
  it('lit une fourchette française en milliers', () => {
    const r = lireRemuneration('65 – 78 k€ brut annuel')
    expect(r?.periode).toBe('an')
    expect(versDecimal(r!.min!)).toBe(65_000)
    expect(versDecimal(r!.max!)).toBe(78_000)
    expect(r?.min?.devise).toBe('EUR')
  })

  it('lit un montant mensuel en francs CFA, espaces fines comprises', () => {
    const r = lireRemuneration('1 200 000 FCFA / mois')
    expect(r?.periode).toBe('mois')
    expect(r?.min?.devise).toBe('XOF')
    expect(versDecimal(r!.min!)).toBe(1_200_000)
  })

  it('lit un montant canadien sans période explicite', () => {
    const r = lireRemuneration('78 000 CAD')
    expect(r?.min?.devise).toBe('CAD')
    expect(r?.periode, 'un salaire sans période est annuel par convention').toBe('an')
  })

  it('lit une virgule décimale française', () => {
    expect(versDecimal(lireRemuneration('55,5 k€ par an')!.min!)).toBe(55_500)
  })

  it('conserve le texte d’origine — on n’affiche jamais mieux que ce qu’on a lu', () => {
    expect(lireRemuneration('65 – 78 k€')?.texteOrigine).toBe('65 – 78 k€')
  })

  it.each([
    ['Selon profil'],
    ['Rémunération attractive'],
    ['65 000'],
    [''],
    [undefined],
  ])('renvoie null plutôt que de deviner : %s', (texte) => {
    expect(lireRemuneration(texte)).toBeNull()
  })

  it('ignore les nombres qui ne sont pas des salaires', () => {
    // « 2 jours de télétravail » ne doit pas devenir une fourchette.
    const r = lireRemuneration('60 k€ par an, 2 jours de télétravail')
    expect(versDecimal(r!.min!)).toBe(60_000)
    expect(r?.max).toBeUndefined()
  })
})

describe('annualiser reste dans SA devise', () => {
  it('ramène un mensuel à l’année', () => {
    const a = annualiser(lireRemuneration('1 200 000 FCFA / mois')!)
    expect(versDecimal(a.min!)).toBe(14_400_000)
    expect(a.devise).toBe('XOF')
  })

  it('laisse un annuel intact', () => {
    expect(versDecimal(annualiser(lireRemuneration('65 k€ par an')!).min!)).toBe(65_000)
  })

  it('ne convertit JAMAIS de devise au passage', () => {
    // Convertir demande un taux, un taux a une date, et une valeur convertie
    // doit s'afficher COMME une conversion. Les mélanger ferait passer une
    // estimation pour un montant annoncé.
    expect(annualiser(lireRemuneration('78 000 CAD')!).devise).toBe('CAD')
  })
})

describe('une conversion se présente comme une estimation', () => {
  it('porte son taux et sa date, et se déclare estimation', () => {
    const c = convertir({ unitesMineures: 7_800_000, devise: 'CAD' }, 'EUR', 0.68, '2026-08-25')
    expect(c.estEstimation).toBe(true)
    expect(c.taux).toBe(0.68)
    expect(c.tauxDate).toBe('2026-08-25')
    expect(versDecimal(c.montant)).toBeCloseTo(53_040, 0)
    expect(c.origine.devise, 'le montant annoncé doit rester disponible').toBe('CAD')
  })
})

describe('une date sans fuseau ne veut rien dire', () => {
  it('conserve le fuseau donné par la source', () => {
    const p = lirePublication('2026-08-25T09:00:00+02:00')
    expect(p?.fuseauOrigine).toBe('+02:00')
    expect(p?.instant.toISOString()).toBe('2026-08-25T07:00:00.000Z')
  })

  it('une date sans heure est ramenée à midi, pas à minuit', () => {
    // Minuit fait paraître une offre plus vieille d'un jour dans la moitié des
    // fuseaux — et la fraîcheur est la promesse du produit.
    const p = lirePublication('2026-08-25')
    expect(p?.instant.toISOString()).toBe('2026-08-25T12:00:00.000Z')
    expect(p?.precisionJour).toBe(true)
  })

  it('refuse une date illisible plutôt que d’inventer maintenant', () => {
    expect(lirePublication('hier')).toBeNull()
    expect(lirePublication('')).toBeNull()
    expect(lirePublication(undefined)).toBeNull()
  })

  it('une offre datée du futur n’a pas un âge négatif', () => {
    const futur = lirePublication(new Date(Date.now() + 86_400_000).toISOString())!
    expect(ageSecondes(futur)).toBe(0)
  })

  it('calcule un âge en secondes', () => {
    const p = lirePublication('2026-08-25T10:00:00Z')!
    expect(ageSecondes(p, new Date('2026-08-25T10:06:00Z'))).toBe(360)
  })
})
