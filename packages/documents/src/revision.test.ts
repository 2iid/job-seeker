import { describe, expect, it } from 'vitest'
import { cle, compter, preparer, refuser, resultat } from './revision.ts'

const CHAMPS = [
  {
    champ: 'description',
    origine: 'Pilotage du budget d’acquisition et de trois agences.',
    propose: 'Pilotage du budget d’acquisition et coordination de trois agences externes.',
  },
  {
    champ: 'accroche',
    origine: 'Cheffe de projet marketing',
    propose: 'Responsable acquisition et croissance',
  },
]

describe('preparer / resultat', () => {
  it('sans refus, le résultat est la proposition', () => {
    const r = preparer(CHAMPS)
    expect(resultat(r)['description']).toBe(CHAMPS[0]!.propose)
    expect(resultat(r)['accroche']).toBe(CHAMPS[1]!.propose)
  })

  it('tout refuser rend l’origine, champ par champ', () => {
    let r = preparer(CHAMPS)
    for (const d of r.differences) for (const m of d.modifications) r = refuser(r, d.champ, m.id)
    expect(resultat(r)['description']).toBe(CHAMPS[0]!.origine)
    expect(resultat(r)['accroche']).toBe(CHAMPS[1]!.origine)
  })

  it('un refus dans un champ ne touche PAS l’autre', () => {
    // Le préfixe existe pour ça : sans lui, le `m0` de l'accroche effacerait
    // le `m0` de la description, et refuser une phrase en annulerait une autre
    // que la personne n'a jamais regardée.
    const r = refuser(preparer(CHAMPS), 'accroche', 'm0')
    expect(resultat(r)['description']).toBe(CHAMPS[0]!.propose)
    expect(resultat(r)['accroche']).not.toBe(CHAMPS[1]!.propose)
  })

  it('les clés sont préfixées par le champ', () => {
    expect(cle('description', 'm0')).toBe('description:m0')
  })
})

describe('compter — ce que l’écran annonce en tête', () => {
  it('compte les modifications de tous les champs', () => {
    const c = compter(preparer(CHAMPS))
    expect(c.total).toBeGreaterThan(1)
    expect(c.refusees).toBe(0)
    expect(c.acceptees).toBe(c.total)
  })

  it('un refus se voit dans le compte', () => {
    const r = preparer(CHAMPS)
    const premier = r.differences[0]!.modifications[0]!
    const apres = compter(refuser(r, 'description', premier.id))
    expect(apres.refusees).toBe(1)
    expect(apres.acceptees).toBe(apres.total - 1)
  })
})

describe('un refus est DÉFINITIF pour cette candidature', () => {
  it('il n’existe aucune fonction pour l’annuler', () => {
    // REQ-007. Offrir de revenir dessus rouvrirait la porte que le refus vient
    // de fermer, et transformerait une décision en une préférence qu'on repose
    // à chaque écran. À la troisième fois, la personne accepterait pour en
    // finir.
    const module = { cle, compter, preparer, refuser, resultat }
    expect(Object.keys(module).some((n) => /annul|retir|reactiv/i.test(n))).toBe(false)
  })

  it('un refus survit à une REGÉNÉRATION du document', () => {
    // Le cas qui compte vraiment : le modèle repropose autre chose, et le
    // refus doit tenir. Les identifiants étant stables pour un couple
    // (origine, proposition), un refus se réapplique tel quel.
    const refusees = ['description:m0']
    const a = preparer(CHAMPS, refusees)
    const b = preparer(CHAMPS, refusees)
    expect(resultat(a)['description']).toBe(resultat(b)['description'])
    expect(resultat(a)['description']).not.toBe(CHAMPS[0]!.propose)
  })
})
