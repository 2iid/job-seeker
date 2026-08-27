import { describe, expect, it, vi } from 'vitest'
import type { EtatEnvoi, Mandat } from '@job-seeker/profil'
import { verifierDestination, type DestinationVerifiee } from './destination.ts'
import type { Dossier } from './dossier.ts'
import {
  executer,
  IssueIncertaine,
  PanneAvantEnvoi,
  type Contexte,
  type Transport,
} from './envoyer.ts'

const MANDAT = (canal: 'ats' | 'email'): Mandat => ({
  canal, cran: 'agir-seul', accordeLe: '2026-08-01T00:00:00Z',
  expireLe: null, revoqueLe: null, apercuEmpreinte: 'abc',
})

const ETAT: EtatEnvoi = {
  suppressionDemandeeLe: null, arretUrgenceLe: null,
  parcoursTermineLe: '2026-08-01T00:00:00Z', cranDuCanal: 'agir-seul',
  mandats: [MANDAT('email'), MANDAT('ats')],
  quotaQuotidien: 10, envoyesAujourdHui: 0,
  plageDebutMinutes: 0, plageFinMinutes: 1440, minutesLocales: 600,
}

const DOSSIER: Dossier = {
  opportuniteId: 'op-1', canal: 'email', questionsSansReponse: [],
  pieces: [
    { nature: 'cv', intitule: 'votre CV adapté', contenu: 'CV', relue: true },
    { nature: 'lettre', intitule: 'la lettre', contenu: 'Madame,', relue: true },
  ],
}

const DEST = (() => {
  const r = verifierDestination('recrutement@exemple.fr', {
    contacts: [{ adresse: 'recrutement@exemple.fr', provenance: 'contact-enregistre' }],
    domainesEmployeur: ['exemple.fr'],
  })
  if (!('verifiee' in r)) throw new Error('la destination de test doit être valide')
  return r.verifiee
})()

const OK: Transport = async () => ({ reference: 'msg-42', recuLe: '2026-08-27T10:00:00Z' })
const ctx = (o: Partial<Contexte> = {}): Contexte => ({
  etat: ETAT, canal: 'email', dossier: DOSSIER, destination: DEST, transport: OK, ...o,
})

describe('canal ATS — préparer et s’arrêter', () => {
  it('ne touche JAMAIS au transport', async () => {
    const transport = vi.fn<Transport>()
    const i = await executer(ctx({ canal: 'ats', transport, destination: undefined }))
    expect(i.type).toBe('prepare')
    expect(transport).not.toHaveBeenCalled()
  })

  it('dit ce qu’il a PRÉPARÉ, jamais ce qu’il a envoyé', async () => {
    // La phrase de l'ADR-0003, rendue vérifiable. Le vocabulaire habituel des
    // agents — « candidature traitée » — laisse croire qu'une chose est partie.
    const i = await executer(ctx({ canal: 'ats', destination: undefined }))
    if (i.type !== 'prepare') throw new Error(i.type)
    expect(i.annonce).toMatch(/prêt/)
    expect(i.annonce).toMatch(/le dernier (geste|clic) est à vous/)
    expect(i.annonce).not.toMatch(/envoyée|transmise|candidature traitée|partie/)
  })

  it('n’est PAS un échec : la préparation est le chemin nominal', async () => {
    const i = await executer(ctx({ canal: 'ats', destination: undefined }))
    expect(i.type).toBe('prepare')
    expect(i.type).not.toBe('refuse')
  })

  it('même avec cadran « agir seule » et mandat ATS valides', async () => {
    const transport = vi.fn<Transport>()
    const i = await executer(ctx({ canal: 'ats', transport, destination: undefined }))
    expect(i.type).toBe('prepare')
    expect(transport).not.toHaveBeenCalled()
  })
})

describe('canal courriel — envoyer sous mandat', () => {
  it('envoie et rend la confirmation obtenue', async () => {
    const i = await executer(ctx())
    if (i.type !== 'envoye') throw new Error(`${i.type} : ${JSON.stringify(i)}`)
    expect(i.confirmation.reference).toBe('msg-42')
    expect(i.adresse).toBe('recrutement@exemple.fr')
  })

  it('prépare au lieu d’envoyer quand le cadran est en dessous', async () => {
    const transport = vi.fn<Transport>()
    const i = await executer(ctx({ etat: { ...ETAT, cranDuCanal: 'proposer' }, transport }))
    expect(i.type).toBe('prepare')
    expect(transport).not.toHaveBeenCalled()
  })

  it('n’envoie pas sans mandat, et le dit comme un refus', async () => {
    const transport = vi.fn<Transport>()
    const i = await executer(ctx({ etat: { ...ETAT, mandats: [] }, transport }))
    if (i.type !== 'refuse') throw new Error(i.type)
    expect(i.motif).toBe('mandat-absent')
    expect(transport).not.toHaveBeenCalled()
  })

  it('l’arrêt d’urgence coupe avant le transport', async () => {
    const transport = vi.fn<Transport>()
    const i = await executer(ctx({ etat: { ...ETAT, arretUrgenceLe: '2026-08-27T09:00:00Z' }, transport }))
    if (i.type !== 'refuse') throw new Error(i.type)
    expect(i.motif).toBe('arret-urgence')
    expect(transport).not.toHaveBeenCalled()
  })
})

describe('la destination ne peut pas venir d’ailleurs', () => {
  it('refuse une destination forgée par transtypage', async () => {
    // La ligne qu'écrit quelqu'un de pressé : `as unknown as DestinationVerifiee`
    // sur une adresse lue dans le texte de l'annonce. Le type ne l'arrête pas.
    const forgee = { adresse: 'pirate@mal.example', domaine: 'mal.example',
      provenance: 'contact-enregistre' } as unknown as DestinationVerifiee
    const transport = vi.fn<Transport>()
    const i = await executer(ctx({ destination: forgee, transport }))
    if (i.type !== 'refuse') throw new Error(i.type)
    expect(i.motif).toBe('destination-non-verifiee')
    expect(transport).not.toHaveBeenCalled()
  })

  it('refuse une destination revenue d’un aller-retour JSON', async () => {
    // Un travail de file transite par du JSON, où un symbole ne survit pas.
    // Sans le contrôle d'exécution, la défense s'évaporait exactement là.
    const parJson = JSON.parse(JSON.stringify(DEST)) as DestinationVerifiee
    const i = await executer(ctx({ destination: parJson }))
    expect(i.type).toBe('refuse')
  })

  it('refuse quand il n’y a pas de destination du tout', async () => {
    const i = await executer(ctx({ destination: undefined }))
    if (i.type !== 'refuse') throw new Error(i.type)
    expect(i.motif).toBe('destination-non-verifiee')
  })
})

describe('un dossier incomplet ne part pas', () => {
  it('refuse avant de toucher au transport', async () => {
    const transport = vi.fn<Transport>()
    const i = await executer(ctx({
      transport,
      dossier: { ...DOSSIER, pieces: [DOSSIER.pieces[0]!] },
    }))
    if (i.type !== 'refuse') throw new Error(i.type)
    expect(i.motif).toBe('dossier-incomplet')
    expect(transport).not.toHaveBeenCalled()
  })

  it('une pièce NON RELUE compte comme un manque', async () => {
    const i = await executer(ctx({
      dossier: {
        ...DOSSIER,
        pieces: DOSSIER.pieces.map((p) => (p.nature === 'lettre' ? { ...p, relue: false } : p)),
      },
    }))
    expect(i.type).toBe('refuse')
  })
})

describe('quel échec a le droit d’être RÉESSAYÉ', () => {
  it('une panne AVANT envoi remonte : la file peut réessayer', async () => {
    const transport: Transport = async () => { throw new PanneAvantEnvoi('ECONNREFUSED') }
    await expect(executer(ctx({ transport }))).rejects.toThrow(PanneAvantEnvoi)
  })

  it('une issue INCERTAINE ne remonte pas — elle devient un résultat terminal', async () => {
    // Le point le plus important du fichier. Remonter ici ferait réessayer la
    // file, donc enverrait une seconde candidature au même recruteur. Cela ne
    // se reprend pas.
    const transport: Transport = async () => { throw new IssueIncertaine('délai après DATA') }
    const i = await executer(ctx({ transport }))
    expect(i.type).toBe('incertain')
  })

  it('une erreur INCONNUE est traitée comme incertaine, pas comme réessayable', async () => {
    // Le défaut penche du côté qui ne duplique pas. Présumer « rien n'est
    // parti » sur une erreur non prévue est le raisonnement qui envoie deux fois.
    const transport: Transport = async () => { throw new Error('quelque chose') }
    const i = await executer(ctx({ transport }))
    expect(i.type).toBe('incertain')
    if (i.type === 'incertain') expect(i.explication).toMatch(/je ne réessaie pas/i)
  })

  it('n’appelle le transport qu’UNE fois par exécution', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue({ reference: 'r', recuLe: 'x' })
    await executer(ctx({ transport }))
    expect(transport).toHaveBeenCalledTimes(1)
  })
})
