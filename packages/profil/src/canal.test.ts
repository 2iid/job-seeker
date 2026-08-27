import { describe, expect, it } from 'vitest'
import { accepteEnvoiAutonome, ENVOI_AUTONOME, pourquoiPasSeul } from './canal.ts'
import { peutEnvoyer, type EtatEnvoi, type Mandat } from './envoi.ts'

const MANDAT = (canal: 'ats' | 'email' | 'formulaire'): Mandat => ({
  canal, cran: 'agir-seul', accordeLe: '2026-08-01T00:00:00Z',
  expireLe: null, revoqueLe: null, apercuEmpreinte: 'abc',
})

const PRET: EtatEnvoi = {
  suppressionDemandeeLe: null,
  arretUrgenceLe: null,
  parcoursTermineLe: '2026-08-01T00:00:00Z',
  cranDuCanal: 'agir-seul',
  mandats: [MANDAT('ats'), MANDAT('email'), MANDAT('formulaire')],
  quotaQuotidien: 10,
  envoyesAujourdHui: 0,
  plageDebutMinutes: 0,
  plageFinMinutes: 1440,
  minutesLocales: 600,
}

describe('ADR-0003 — quels canaux le produit exécute seul', () => {
  it('le courriel est le seul', () => {
    expect(accepteEnvoiAutonome('email')).toBe(true)
    expect(accepteEnvoiAutonome('ats')).toBe(false)
    expect(accepteEnvoiAutonome('formulaire')).toBe(false)
  })

  it('un canal non mesuré est REFUSÉ, pas toléré', () => {
    // « Non mesuré » n'est pas « sûr ». Si un canal est ajouté demain sans
    // qu'on ait tranché, le défaut doit être le refus — et ce test le rappelle
    // à qui ajoutera une entrée.
    const permissifs = Object.entries(ENVOI_AUTONOME).filter(([, ok]) => ok)
    expect(permissifs.map(([c]) => c)).toEqual(['email'])
  })
})

describe('« agir seule » sur un canal ATS', () => {
  it('est REFUSÉ D’HONORER, même avec cadran et mandat parfaits', () => {
    // Tout est en règle : parcours fini, cadran sur agir-seul, mandat valide,
    // quota libre, dans la plage. C'est précisément le cas où l'ancienne
    // version envoyait.
    const d = peutEnvoyer(PRET, 'ats')
    expect(d.envoyer).toBe(false)
    if (!d.envoyer) expect(d.motif).toBe('canal-sans-envoi-autonome')
  })

  it('vaut aussi pour un formulaire hors ATS', () => {
    const d = peutEnvoyer(PRET, 'formulaire')
    expect(d.envoyer).toBe(false)
    if (!d.envoyer) expect(d.motif).toBe('canal-sans-envoi-autonome')
  })

  it('n’empêche PAS l’envoi sur le courriel dans le même état', () => {
    // La contrepartie : ADR-0003 conserve l'envoi autonome par courriel. Un
    // refus qui déborderait sur ce canal viderait la décision de son contenu.
    expect(peutEnvoyer(PRET, 'email').envoyer).toBe(true)
  })

  it('explique la décision plutôt que d’invoquer une impossibilité', () => {
    const d = peutEnvoyer(PRET, 'ats')
    expect(d.envoyer).toBe(false)
    if (d.envoyer) return
    // Ce n'est pas « je ne peux pas » : c'est « je ne le fais pas, et voici
    // pourquoi ». La nuance est tout l'objet de l'ADR.
    expect(d.explication).toContain('anti-robot')
    expect(d.explication).toMatch(/le dernier clic est à vous/)
    expect(d.explication).not.toMatch(/impossible|erreur|indisponible/i)
  })

  it('n’est pas mis en file : attendre ne changera rien', () => {
    const d = peutEnvoyer(PRET, 'ats')
    expect(d.envoyer).toBe(false)
    if (!d.envoyer) expect(d.enFile).toBe(false)
  })
})

describe('l’ordre des refus', () => {
  it('un cadran en dessous d’« agir seule » entend le message ORDINAIRE', () => {
    // Quelqu'un qui n'a rien demandé d'autonome n'a pas à recevoir un exposé
    // sur les limites du canal : sa configuration fonctionne comme prévu.
    const d = peutEnvoyer({ ...PRET, cranDuCanal: 'proposer' }, 'ats')
    expect(d.envoyer).toBe(false)
    if (!d.envoyer) {
      expect(d.motif).toBe('cran-insuffisant')
      expect(d.explication).not.toContain('anti-robot')
    }
  })

  it('l’arrêt d’urgence passe AVANT la capacité du canal', () => {
    const d = peutEnvoyer({ ...PRET, arretUrgenceLe: '2026-08-27T10:00:00Z' }, 'ats')
    expect(d.envoyer).toBe(false)
    if (!d.envoyer) expect(d.motif).toBe('arret-urgence')
  })

  it('ne réclame PAS de mandat pour une action qu’on n’exécutera jamais', () => {
    // Sans mandat du tout sur le canal ATS, le motif reste celui du canal :
    // faire signer un mandat pour rien serait pire qu'inutile.
    const d = peutEnvoyer({ ...PRET, mandats: [] }, 'ats')
    expect(d.envoyer).toBe(false)
    if (!d.envoyer) expect(d.motif).toBe('canal-sans-envoi-autonome')
  })
})

describe('pourquoiPasSeul', () => {
  it('dit ce qui va se passer, pas seulement ce qui ne se passera pas', () => {
    for (const c of ['ats', 'formulaire'] as const) {
      expect(pourquoiPasSeul(c)).toMatch(/prépare/)
      expect(pourquoiPasSeul(c)).toMatch(/vous/)
    }
  })
})
