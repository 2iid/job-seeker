import { describe, expect, it, vi } from 'vitest'
import { creerJournal } from '@job-seeker/observability'
import { creerBascule } from './bascule.ts'
import { ErreurFournisseur, categoriser, type Demande, type Fournisseur, type Reponse } from './types.ts'

const demande: Demande = {
  systeme: 'Tu aides une personne à candidater.',
  messages: [{ role: 'user', content: 'Bonjour' }],
  maxTokens: 128,
  imputableA: 'cand-1',
}

const reponse = (nom: string, patch: Partial<Reponse> = {}): Reponse => ({
  texte: `réponse de ${nom}`, fournisseur: nom, modele: 'claude-opus-5',
  tokensEntree: 100, tokensSortie: 20, refus: false, ...patch,
})

const qui = (nom: string, impl: () => Promise<Reponse>, disponible = true): Fournisseur => ({
  nom, disponible, completer: impl,
})

const journalMuet = () => creerJournal({ runtime: 'worker' }, () => undefined)

describe('catégoriser une panne, et rien d’autre', () => {
  it.each([
    [429, 'panne', 'débit dépassé'],
    [402, 'panne', 'crédit épuisé — exactement le cas visé'],
    [500, 'panne', 'serveur'],
    [503, 'panne', 'indisponible'],
    [undefined, 'panne', 'réseau ou délai'],
  ] as const)('%s → %s (%s)', (statut, attendu, _pourquoi) => {
    expect(categoriser(statut)).toBe(attendu)
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [400, 'demande-invalide'],
    [422, 'demande-invalide'],
  ] as const)('%i → %s : basculer n’aiderait pas', (statut, attendu) => {
    expect(categoriser(statut)).toBe(attendu)
  })
})

describe('la bascule ne joue que sur les pannes', () => {
  it('bascule quand le premier est à court de crédit', async () => {
    const b = creerBascule([
      qui('primaire', async () => { throw new ErreurFournisseur('primaire', 'panne', 'crédit épuisé', 402) }),
      qui('secours', async () => reponse('secours')),
    ], journalMuet())
    const r = await b.completer(demande)
    expect(r.fournisseur).toBe('secours')
    expect(r.essais).toEqual(['primaire', 'secours'])
  })

  it('n’appelle PAS le secours quand le premier répond', async () => {
    const secours = vi.fn(async () => reponse('secours'))
    const b = creerBascule([qui('primaire', async () => reponse('primaire')), qui('secours', secours)], journalMuet())
    const r = await b.completer(demande)
    expect(r.fournisseur).toBe('primaire')
    expect(secours).not.toHaveBeenCalled()
  })

  it('NE BASCULE PAS sur un refus du modèle — c’est une réponse, pas une panne', async () => {
    // Aller chercher un autre fournisseur pour obtenir une autre réponse serait
    // du magasinage de complaisance. La bascule existe pour les pannes.
    const secours = vi.fn(async () => reponse('secours'))
    const b = creerBascule([
      qui('primaire', async () => reponse('primaire', { refus: true, texte: '', motifRefus: 'cyber' })),
      qui('secours', secours),
    ], journalMuet())

    const r = await b.completer(demande)
    expect(r.refus).toBe(true)
    expect(r.motifRefus).toBe('cyber')
    expect(secours, 'un refus a été contourné en changeant de fournisseur').not.toHaveBeenCalled()
  })

  it('NE BASCULE PAS sur une demande invalide — le second brûlerait pareil', async () => {
    const secours = vi.fn(async () => reponse('secours'))
    const b = creerBascule([
      qui('primaire', async () => { throw new ErreurFournisseur('primaire', 'demande-invalide', 'schéma', 400) }),
      qui('secours', secours),
    ], journalMuet())
    await expect(b.completer(demande)).rejects.toThrow(/schéma/)
    expect(secours, 'rejouer une demande invalide masque le vrai bug').not.toHaveBeenCalled()
  })

  it('NE BASCULE PAS sur une auth refusée — il faut qu’on l’apprenne', async () => {
    const secours = vi.fn(async () => reponse('secours'))
    const b = creerBascule([
      qui('primaire', async () => { throw new ErreurFournisseur('primaire', 'auth', 'clé rejetée', 401) }),
      qui('secours', secours),
    ], journalMuet())
    await expect(b.completer(demande)).rejects.toThrow(/clé rejetée/)
    expect(secours).not.toHaveBeenCalled()
  })

  it('ignore un fournisseur non configuré au lieu de le tenter', async () => {
    const b = creerBascule([
      qui('absent', async () => reponse('absent'), false),
      qui('present', async () => reponse('present')),
    ], journalMuet())
    expect((await b.completer(demande)).essais).toEqual(['present'])
  })

  it('dit clairement quoi faire quand aucun fournisseur n’est configuré', async () => {
    const b = creerBascule([qui('a', async () => reponse('a'), false)], journalMuet())
    await expect(b.completer(demande)).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })

  it('quand TOUS tombent, nomme ce qui a été tenté', async () => {
    const b = creerBascule([
      qui('un', async () => { throw new ErreurFournisseur('un', 'panne', 'x', 500) }),
      qui('deux', async () => { throw new ErreurFournisseur('deux', 'panne', 'y', 503) }),
    ], journalMuet())
    await expect(b.completer(demande)).rejects.toThrow(/un, deux/)
  })
})

describe('le coût est imputé, jamais anonyme', () => {
  it('enregistre l’usage avec la candidature concernée', async () => {
    const lignes: string[] = []
    const journal = creerJournal({ runtime: 'worker' }, (l) => lignes.push(l), () => '2026-08-26T00:00:00.000Z')
    const b = creerBascule([qui('primaire', async () => reponse('primaire'))], journal)
    await b.completer(demande)
    const usage = lignes.map((l) => JSON.parse(l) as Record<string, unknown>).find((o) => o['msg'] === 'usage modèle')
    expect(usage).toMatchObject({ applicationId: 'cand-1', model: 'claude-opus-5' })
    expect(Number(usage?.['costEur'])).toBeGreaterThan(0)
  })

  it('le journal d’un échec ne divulgue pas le contenu de la demande', async () => {
    const lignes: string[] = []
    const journal = creerJournal({ runtime: 'worker' }, (l) => lignes.push(l))
    const b = creerBascule([
      qui('primaire', async () => { throw new ErreurFournisseur('primaire', 'panne', 'boum', 500) }),
      qui('secours', async () => reponse('secours')),
    ], journal)
    await b.completer(demande)
    expect(lignes.join('')).not.toContain('Tu aides une personne')
  })
})
