import { describe, expect, it } from 'vitest'
import { CRANS, CRAN_PAR_DEFAUT, LIBELLES, peutAgirSeule, peutProposer, SENS, type EtatAutonomie } from './autonomie.ts'

const etat = (o: Partial<EtatAutonomie> = {}): EtatAutonomie => ({
  cran: 'agir-seul',
  parcoursTermineLe: '2026-08-26T10:00:00Z',
  mandatValide: true,
  ...o,
})

describe('le défaut n’est jamais le plus permissif', () => {
  it('c’est « proposer »', () => {
    // Pas « observer », qui rendrait le produit inutile le premier jour.
    // Surtout pas « agir seul », qui prendrait une confiance non donnée.
    expect(CRAN_PAR_DEFAUT).toBe('proposer')
    expect(CRANS.indexOf(CRAN_PAR_DEFAUT)).toBeLessThan(CRANS.length - 1)
  })

  it('les quatre crans montent en confiance, dans cet ordre', () => {
    expect(CRANS).toEqual(['observer', 'proposer', 'agir-apres-accord', 'agir-seul'])
  })
})

describe('la garde du parcours d’entrée — JOB-081', () => {
  it('rien ne part tant que le parcours n’est pas terminé, MÊME à « agir seul »', () => {
    // Le parcours MONTRE le cadran et laisse le déplacer, parce que c'est là
    // que la personne comprend ce qu'elle accorde. Elle le déplace pour
    // APPRENDRE — et pendant ce temps l'agent trouve de vraies offres sous ses
    // yeux. Sans cette garde, un geste de curiosité enverrait une vraie
    // candidature à un vrai recruteur.
    const v = peutAgirSeule(etat({ parcoursTermineLe: null }))
    expect(v.autorise).toBe(false)
    expect(v.autorise === false && v.motif).toBe('parcours-en-cours')
  })

  it('elle vaut pour TOUS les crans, sans exception', () => {
    for (const cran of CRANS) {
      expect(peutAgirSeule(etat({ cran, parcoursTermineLe: null })).autorise, cran).toBe(false)
      expect(peutProposer(etat({ cran, parcoursTermineLe: null })).autorise, cran).toBe(false)
    }
  })

  it('elle bloque aussi la PRÉPARATION — préparer, c’est déjà dépenser', () => {
    expect(peutProposer(etat({ cran: 'proposer', parcoursTermineLe: null })).autorise).toBe(false)
  })

  it('elle ne dit pas « il vous manque un mandat » à qui n’a pas fini son parcours', () => {
    // L'ordre des vérifications est le message : ce serait lui demander de
    // résoudre un problème qu'il n'a pas encore.
    const v = peutAgirSeule(etat({ parcoursTermineLe: null, mandatValide: false }))
    expect(v.autorise === false && v.motif).toBe('parcours-en-cours')
    expect(v.autorise === false && v.explication).not.toMatch(/mandat/i)
  })
})

describe('peutAgirSeule — trois conditions, aucune facultative', () => {
  it('autorise quand tout est réuni', () => {
    expect(peutAgirSeule(etat()).autorise).toBe(true)
  })

  it('refuse en dessous d’« agir seul »', () => {
    for (const cran of ['observer', 'proposer', 'agir-apres-accord'] as const) {
      const v = peutAgirSeule(etat({ cran }))
      expect(v.autorise, cran).toBe(false)
      expect(v.autorise === false && v.motif).toBe('cran-insuffisant')
    }
  })

  it('refuse sans mandat, même au cran maximal', () => {
    // REQ-009 : « agir seul » exige un mandat explicite HORODATÉ, précédé d'un
    // aperçu intégral de ce qui sera envoyé. Le cadran ne le remplace pas.
    const v = peutAgirSeule(etat({ mandatValide: false }))
    expect(v.autorise).toBe(false)
    expect(v.autorise === false && v.motif).toBe('mandat-absent')
  })
})

describe('peutProposer', () => {
  it('« observer » ne prépare rien', () => {
    const v = peutProposer(etat({ cran: 'observer' }))
    expect(v.autorise).toBe(false)
  })

  it('les trois autres crans préparent', () => {
    for (const cran of ['proposer', 'agir-apres-accord', 'agir-seul'] as const) {
      expect(peutProposer(etat({ cran })).autorise, cran).toBe(true)
    }
  })
})

describe('les mots du cadran', () => {
  it('chaque cran a un libellé et un SENS, dans les deux langues', () => {
    // Un libellé seul (« Proposer ») ne dit pas ce qui change. C'est le sens
    // qui permet de choisir, et quelqu'un qui choisit sans comprendre ne
    // donne pas sa confiance : il la subit.
    for (const locale of ['fr', 'en'] as const) {
      for (const cran of CRANS) {
        expect(LIBELLES[locale][cran], `${locale}/${cran}`).toBeTruthy()
        expect(SENS[locale][cran].length, `${locale}/${cran}`).toBeGreaterThan(40)
      }
    }
  })

  it('le sens d’« agir seule » annonce le mandat', () => {
    expect(SENS.fr['agir-seul']).toMatch(/mandat/i)
    expect(SENS.en['agir-seul']).toMatch(/mandate/i)
  })

  it('aucun sens ne promet ce que le cran ne fait pas', () => {
    expect(SENS.fr.observer).toMatch(/n.envoie rien/i)
    expect(SENS.fr.proposer).toMatch(/vous envoyez/i)
  })
})
