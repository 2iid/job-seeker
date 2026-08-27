/**
 * NOTE (ADR-0003, 2026-08-27) — les fixtures de ce fichier utilisaient le canal
 * 'ats'. Elles ont été écrites quand un canal ATS pouvait envoyer seul ; huit
 * d'entre elles sont tombées le jour où le produit a cessé de l'honorer.
 *
 * Elles sont passées au canal 'email' plutôt qu'ajustées une par une : ce sont
 * les contrôles EN AVAL — mandat, quota, plage horaire — qu'elles vérifient, et
 * le courriel est désormais le seul canal où ces contrôles sont atteints.
 * Le refus par canal a ses propres tests dans `canal.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { mandatCourant, minutesLocales, peutEnvoyer, type EtatEnvoi, type Mandat } from './envoi.ts'

const MAINTENANT = new Date('2026-08-26T12:00:00Z')

const mandat = (o: Partial<Mandat> = {}): Mandat => ({
  canal: 'email',
  cran: 'agir-seul',
  accordeLe: '2026-08-01T00:00:00Z',
  expireLe: '2026-12-31T00:00:00Z',
  revoqueLe: null,
  apercuEmpreinte: 'abc123',
  ...o,
})

const etat = (o: Partial<EtatEnvoi> = {}): EtatEnvoi => ({
  suppressionDemandeeLe: null,
  arretUrgenceLe: null,
  parcoursTermineLe: '2026-08-01T00:00:00Z',
  cranDuCanal: 'agir-seul',
  mandats: [mandat()],
  quotaQuotidien: 10,
  envoyesAujourdHui: 0,
  plageDebutMinutes: 8 * 60,
  plageFinMinutes: 19 * 60,
  minutesLocales: 14 * 60,
  ...o,
})

describe('l’ordre des vérifications EST le message', () => {
  it('une suppression demandée passe avant TOUT, même l’arrêt d’urgence', () => {
    // Une suppression n'est pas atomique. Entre « elle a cliqué » et « les
    // données sont parties », un travail déjà en file peut partir — et les
    // données qui le prouvaient seraient effacées juste après. Elle ne saurait
    // jamais qu'une candidature est partie en son nom APRÈS sa demande.
    const d = peutEnvoyer(etat({
      suppressionDemandeeLe: '2026-08-27T09:00:00Z',
      arretUrgenceLe: '2026-08-27T09:00:00Z',
    }), 'email', MAINTENANT)
    expect(d.envoyer === false && d.motif).toBe('suppression-en-cours')
    expect(d.envoyer === false && d.enFile).toBe(false)
  })

  it('… et elle bloque même un profil parfaitement mandaté', () => {
    const d = peutEnvoyer(etat({ suppressionDemandeeLe: '2026-08-27T09:00:00Z' }), 'email', MAINTENANT)
    expect(d.envoyer).toBe(false)
  })

  it('l’arrêt d’urgence passe avant tout le reste', () => {
    // Quelqu'un qui vient d'appuyer sur l'arrêt ne doit pas lire un message
    // sur son quota : ce serait lui parler d'un problème qu'il n'a pas, à
    // propos d'une machine qu'il croit arrêtée.
    const d = peutEnvoyer(etat({
      arretUrgenceLe: '2026-08-26T11:59:00Z',
      envoyesAujourdHui: 999,
      minutesLocales: 3 * 60,
      mandats: [],
    }), 'email', MAINTENANT)
    expect(d.envoyer).toBe(false)
    expect(d.envoyer === false && d.motif).toBe('arret-urgence')
    expect(d.envoyer === false && d.enFile).toBe(false)
  })

  it('le parcours d’entrée passe avant le cran et le mandat', () => {
    const d = peutEnvoyer(etat({ parcoursTermineLe: null, mandats: [] }), 'email', MAINTENANT)
    expect(d.envoyer === false && d.motif).toBe('parcours-en-cours')
  })
})

describe('mandat — REQ-009', () => {
  it('autorise quand tout est réuni', () => {
    const d = peutEnvoyer(etat(), 'email', MAINTENANT)
    expect(d.envoyer).toBe(true)
  })

  it('refuse sans mandat, même au cran maximal', () => {
    expect(peutEnvoyer(etat({ mandats: [] }), 'email', MAINTENANT).envoyer).toBe(false)
  })

  it('un mandat EXPIRÉ ne vaut plus rien', () => {
    // Une échéance existe pour être atteinte : un mandat sans fin est un
    // mandat qu'on oublie d'avoir donné.
    const d = peutEnvoyer(
      etat({ mandats: [mandat({ expireLe: '2026-08-25T00:00:00Z' })] }), 'email', MAINTENANT,
    )
    expect(d.envoyer === false && d.motif).toBe('mandat-expire')
  })

  it('un mandat RÉVOQUÉ ne vaut plus rien non plus', () => {
    const d = peutEnvoyer(
      etat({ mandats: [mandat({ revoqueLe: '2026-08-20T00:00:00Z' })] }), 'email', MAINTENANT,
    )
    expect(d.envoyer === false && d.motif).toBe('mandat-revoque')
  })

  it('le mandat le plus RÉCEMMENT accordé l’emporte', () => {
    // La table est en insertion seule et révoquer consiste à écrire une
    // nouvelle ligne. Prendre le premier trouvé rendrait la révocation
    // inopérante.
    const m = mandatCourant(
      [
        mandat({ accordeLe: '2026-08-01T00:00:00Z' }),
        mandat({ accordeLe: '2026-08-20T00:00:00Z', revoqueLe: '2026-08-20T00:00:00Z' }),
      ],
      'email', MAINTENANT,
    )
    expect(m?.revoqueLe).not.toBeNull()
  })

  it('un mandat sur un AUTRE canal ne vaut pas pour celui-ci', () => {
    // « Canal par canal » est la promesse de REQ-009 : autoriser l'envoi de
    // candidatures ne vaut pas autorisation d'écrire à des recruteurs.
    const d = peutEnvoyer(etat({ mandats: [mandat({ canal: 'ats' })] }), 'email', MAINTENANT)
    expect(d.envoyer === false && d.motif).toBe('mandat-absent')
  })
})

describe('quota et plage — ils METTENT EN FILE, ils ne jettent pas', () => {
  it('le quota atteint met en file', () => {
    // Jeter la candidature punirait quelqu'un d'avoir trouvé trop d'offres le
    // même jour.
    const d = peutEnvoyer(etat({ envoyesAujourdHui: 10 }), 'email', MAINTENANT)
    expect(d.envoyer === false && d.motif).toBe('quota-atteint')
    expect(d.envoyer === false && d.enFile).toBe(true)
    expect(d.envoyer === false && d.explication).toMatch(/pas perdue/)
  })

  it('un quota de zéro arrête tout sans être un arrêt d’urgence', () => {
    expect(peutEnvoyer(etat({ quotaQuotidien: 0 }), 'email', MAINTENANT).envoyer).toBe(false)
  })

  it('hors plage horaire, on attend l’ouverture', () => {
    const d = peutEnvoyer(etat({ minutesLocales: 6 * 60 }), 'email', MAINTENANT)
    expect(d.envoyer === false && d.motif).toBe('hors-plage')
    expect(d.envoyer === false && d.enFile).toBe(true)
  })

  it('une plage qui franchit MINUIT est légitime', () => {
    // Quelqu'un peut vouloir que l'agent travaille la nuit, pour un marché
    // dans un autre fuseau que le sien.
    const nuit = etat({ plageDebutMinutes: 22 * 60, plageFinMinutes: 6 * 60 })
    expect(peutEnvoyer({ ...nuit, minutesLocales: 23 * 60 }, 'email', MAINTENANT).envoyer).toBe(true)
    expect(peutEnvoyer({ ...nuit, minutesLocales: 2 * 60 }, 'email', MAINTENANT).envoyer).toBe(true)
    expect(peutEnvoyer({ ...nuit, minutesLocales: 12 * 60 }, 'email', MAINTENANT).envoyer).toBe(false)
  })
})

describe('minutesLocales — dans le fuseau du candidat', () => {
  it('lit l’heure locale, pas UTC', () => {
    // Stocker un instant UTC ferait glisser la plage d'une heure deux fois par
    // an : l'agent enverrait à 8 h un matin de novembre à quelqu'un qui avait
    // dit « pas avant 9 h ».
    const t = new Date('2026-08-26T12:00:00Z')
    expect(minutesLocales(t, 'UTC')).toBe(12 * 60)
    expect(minutesLocales(t, 'Africa/Dakar')).toBe(12 * 60)
    expect(minutesLocales(t, 'Europe/Paris')).toBe(14 * 60)
    expect(minutesLocales(t, 'America/Sao_Paulo')).toBe(9 * 60)
  })

  it('le décalage saisonnier est pris en compte', () => {
    const janvier = new Date('2026-01-15T12:00:00Z')
    expect(minutesLocales(janvier, 'Europe/Paris')).toBe(13 * 60)
  })
})

describe('un mandat daté du futur n’est pas en vigueur', () => {
  it('il est ignoré au profit du précédent', () => {
    // Le cas paraît théorique jusqu'au jour où une horloge dérive ou qu'un
    // import pose une date en avance — et il vaudrait alors autorisation.
    const m = mandatCourant(
      [mandat({ accordeLe: '2027-01-01T00:00:00Z' }), mandat({ accordeLe: '2026-08-01T00:00:00Z' })],
      'email', MAINTENANT,
    )
    expect(m?.accordeLe).toBe('2026-08-01T00:00:00Z')
  })

  it('et s’il est le seul, il n’autorise rien', () => {
    const d = peutEnvoyer(
      etat({ mandats: [mandat({ accordeLe: '2027-01-01T00:00:00Z' })] }), 'email', MAINTENANT,
    )
    expect(d.envoyer === false && d.motif).toBe('mandat-absent')
  })
})
