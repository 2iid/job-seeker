import { describe, expect, it, vi } from 'vitest'
import { assainir, journaliser, motifManquant, LONGUEUR_MAX_VALEUR, type Ecrivain, type Entree } from './audit.ts'

const entree = (o: Partial<Entree> = {}): Entree => ({
  acteur: 'support', action: 'lecture-dossier', objetTable: 'recus',
  detail: { motif: 'ticket-4412' }, ...o,
})

describe('assainir — un journal qui recopie ce qu’il protège est une SECONDE fuite', () => {
  it('écarte une clé qui désigne du contenu', () => {
    // Et une fuite plus durable que la première : un journal se conserve
    // longtemps, se réplique, et finit dans un outil de recherche.
    const { garde, rejets } = assainir({ cvTexte: 'Amina Diallo, 8 ans', ticket: 'T-1' })
    expect(garde).toEqual({ ticket: 'T-1' })
    expect(rejets).toEqual([{ cle: 'cvTexte', raison: 'cle-interdite' }])
  })

  it('écarte les clés d’identité, quelle que soit leur casse', () => {
    const { garde } = assainir({ email: 'a@b.c', Nom: 'Diallo', TELEPHONE: '0600', ok: 1 })
    expect(garde).toEqual({ ok: 1 })
  })

  it('écarte une valeur trop longue même sous une clé anodine', () => {
    // C'est le contournement évident : renommer le champ.
    const { garde, rejets } = assainir({ note: 'x'.repeat(LONGUEUR_MAX_VALEUR + 1) })
    expect(garde).toEqual({})
    expect(rejets[0]!.raison).toBe('trop-long')
  })

  it('refuse un objet ou un tableau plutôt que de l’aplatir', () => {
    // Ils transportent du contenu par construction. L'aplatir donnerait une
    // chaîne longue, qu'on couperait, et on garderait un début de CV.
    const { garde, rejets } = assainir({ profil: { nom: 'Diallo' }, liste: ['a', 'b'] })
    expect(garde).toEqual({})
    expect(rejets).toHaveLength(2)
  })

  it('garde ce qui sert vraiment à auditer', () => {
    const { garde } = assainir({ ticket: 'T-4412', duree_ms: 120, reussi: true })
    expect(garde).toEqual({ ticket: 'T-4412', duree_ms: 120, reussi: true })
  })
})

describe('journaliser', () => {
  it('n’écrit que la table et l’identifiant, jamais le contenu', async () => {
    const ecrire = vi.fn<Ecrivain>(async () => {})
    await journaliser(ecrire, entree({ objetId: 'r-1', profileId: 'p-1' }))
    const ligne = ecrire.mock.calls[0]![0] as unknown as Record<string, unknown>
    expect(ligne['objet_table']).toBe('recus')
    expect(ligne['objet_id']).toBe('r-1')
    expect(JSON.stringify(ligne)).not.toContain('Diallo')
  })

  it('COMPTE ce qui a été écarté — le savoir est en soi une information', async () => {
    // Une action qui tente d'écrire du contenu à chaque appel mérite qu'on
    // regarde le code qui l'appelle.
    const ecrire = vi.fn<Ecrivain>(async () => {})
    const rejets = await journaliser(ecrire, entree({ detail: { motif: 'T-1', cv: 'texte entier' } }))
    expect(rejets).toHaveLength(1)
    const ligne = ecrire.mock.calls[0]![0] as unknown as { detail: Record<string, unknown> }
    expect(ligne.detail['detail_rejete']).toBe(1)
  })

  it('n’ajoute pas le compteur quand rien n’a été écarté', async () => {
    const ecrire = vi.fn<Ecrivain>(async () => {})
    await journaliser(ecrire, entree())
    const ligne = ecrire.mock.calls[0]![0] as unknown as { detail: Record<string, unknown> }
    expect(ligne.detail).not.toHaveProperty('detail_rejete')
  })
})

describe('motifManquant — un accès sans motif n’est pas auditable', () => {
  it('exige un motif pour une lecture de dossier par le support', () => {
    // « Le support a lu ce dossier » ne dit pas s'il en avait le droit.
    expect(motifManquant(entree({ detail: {} }))).toBe(true)
    expect(motifManquant(entree({ detail: { motif: '   ' } }))).toBe(true)
    expect(motifManquant(entree())).toBe(false)
  })

  it('n’exige rien du worker ni du candidat', () => {
    // Le motif d'un candidat qui lit son propre dossier est qu'il est chez lui.
    expect(motifManquant(entree({ acteur: 'candidat', detail: {} }))).toBe(false)
    expect(motifManquant(entree({ acteur: 'worker', detail: {} }))).toBe(false)
  })

  it('n’exige rien pour une action qui n’est pas une lecture de contenu', () => {
    expect(motifManquant(entree({ action: 'arret-urgence', detail: {} }))).toBe(false)
  })
})
