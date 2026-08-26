import { describe, expect, it, vi } from 'vitest'
import {
  type Connecteur,
  ContratInvalide,
  assertValide,
  couvertureAffirmable,
  estAveugle,
  valider,
} from './contract.ts'
import { Registre, formulerCouverture } from './registre.ts'

const base = (o: Partial<Connecteur> = {}): Connecteur => ({
  id: 'source-test',
  palier: 'a',
  pays: 'monde',
  secteurs: 'tous',
  latenceAttendueSecondes: 180,
  regime: 'libre',
  cadenceMaxParMinute: 20,
  recolter: async () => ({ etat: 'aucun-resultat', offres: [] }),
  ...o,
})

describe('le contrat refuse ce qui rendrait le moteur menteur', () => {
  it('accepte un connecteur complet', () => {
    expect(valider(base())).toEqual([])
  })

  it('refuse une source lente qui se déclare palier A', () => {
    // Le palier A est la seule promesse défendable du produit : « vous êtes
    // parmi les premiers ». Une source relevée toutes les heures qui s'y
    // déclarerait ferait mentir chaque écran qui affiche sa fraîcheur.
    const p = valider(base({ palier: 'a', latenceAttendueSecondes: 3600 }))
    expect(p.join(' ')).toMatch(/palier a/)
  })

  it('refuse une source rapide déclarée palier B — on se sous-vend aussi par erreur', () => {
    expect(valider(base({ palier: 'b', latenceAttendueSecondes: 60 })).join(' ')).toMatch(/palier b/)
  })

  it("refuse un palier C qui prétendrait à une collecte automatique", () => {
    expect(valider(base({ palier: 'c', latenceAttendueSecondes: 999, regime: 'libre' })).join(' '))
      .toMatch(/assiste-uniquement/)
  })

  it("refuse un régime assisté hors du palier C", () => {
    expect(valider(base({ regime: 'assiste-uniquement' })).join(' ')).toMatch(/palier c/)
  })

  it.each([
    [{ id: 'A_Majuscule' }, /id/],
    [{ pays: [] as string[] }, /pays/],
    [{ pays: ['france'] }, /ISO/],
    [{ secteurs: [] as string[] }, /secteurs/],
    [{ cadenceMaxParMinute: 0 }, /cadence/],
    [{ latenceAttendueSecondes: -1 }, /latence/],
  ])('refuse une déclaration incomplète (%#)', (patch, motif) => {
    expect(valider(base(patch as Partial<Connecteur>)).join(' ')).toMatch(motif)
  })

  it('assertValide lève avec la liste complète, pas seulement le premier problème', () => {
    try {
      assertValide(base({ id: 'X', cadenceMaxParMinute: 0 }))
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ContratInvalide)
      expect((e as ContratInvalide).problemes.length).toBeGreaterThan(1)
    }
  })
})

describe('un échec n’est jamais une absence d’offres', () => {
  it('seuls ok et aucun-resultat autorisent à affirmer une couverture', () => {
    expect(couvertureAffirmable('ok')).toBe(true)
    expect(couvertureAffirmable('aucun-resultat')).toBe(true)
    for (const e of ['injoignable', 'quota-atteint', 'auth-refusee', 'format-change', 'erreur'] as const) {
      expect(couvertureAffirmable(e), e).toBe(false)
      expect(estAveugle(e), e).toBe(true)
    }
  })

  it('la phrase affichée dit qu’il MANQUE des sources, au lieu de conclure', () => {
    const b = {
      resultats: [],
      sourcesAffirmables: ['ats'],
      sourcesAveugles: ['agregateur'],
    }
    expect(formulerCouverture(b)).toMatch(/je ne peux pas dire qu'il n'y a rien/)
  })

  it('quand tout a répondu, le silence est une vraie information', () => {
    expect(formulerCouverture({ resultats: [], sourcesAffirmables: ['ats'], sourcesAveugles: [] }))
      .toMatch(/Rien ne correspondait/)
  })
})

describe('le registre — ajouter un marché n’est pas modifier le moteur', () => {
  it('enregistre un connecteur factice sans que le moteur le connaisse', async () => {
    // C'est LE test de la promesse d'ADR-0002 : une source inventée à
    // l'instant traverse tout le moteur sans qu'une ligne le mentionne.
    const r = new Registre()
    r.enregistrer(base({ id: 'marche-imaginaire', pays: ['SN'], secteurs: ['comptabilite'] }))
    const choisis = r.pour({ pays: 'SN', secteur: 'comptabilite' })
    expect(choisis).toHaveLength(1)
    const b = await r.balayer(choisis, { requete: 'comptable' })
    expect(b.sourcesAffirmables).toEqual(['marche-imaginaire'])
  })

  it('refuse un connecteur invalide à l’ENREGISTREMENT, pas en production', () => {
    const r = new Registre()
    expect(() => r.enregistrer(base({ palier: 'a', latenceAttendueSecondes: 9999 }))).toThrow(ContratInvalide)
    expect(r.taille).toBe(0)
  })

  it('refuse deux connecteurs de même identifiant', () => {
    const r = new Registre()
    r.enregistrer(base())
    expect(() => r.enregistrer(base())).toThrow(/déjà enregistré/)
  })

  it('ne sélectionne JAMAIS un palier C pour une récolte automatique', () => {
    const r = new Registre()
    r.enregistrer(base({ id: 'plateforme-fermee', palier: 'c', latenceAttendueSecondes: 0, regime: 'assiste-uniquement' }))
    r.enregistrer(base({ id: 'board-ats' }))
    expect(r.pour({}).map((c) => c.id)).toEqual(['board-ats'])
  })

  it('filtre par pays et par secteur', () => {
    const r = new Registre()
    r.enregistrer(base({ id: 'fr-tech', pays: ['FR'], secteurs: ['tech'] }))
    r.enregistrer(base({ id: 'monde-tous' }))
    expect(r.pour({ pays: 'CA' }).map((c) => c.id)).toEqual(['monde-tous'])
    expect(r.pour({ secteur: 'sante' }).map((c) => c.id)).toEqual(['monde-tous'])
    expect(r.pour({ pays: 'FR', secteur: 'tech' }).map((c) => c.id).sort()).toEqual(['fr-tech', 'monde-tous'])
  })

  it('une source qui explose ne fait pas tomber les autres', async () => {
    const r = new Registre()
    r.enregistrer(base({ id: 'saine', recolter: async () => ({ etat: 'ok', offres: [{
      identifiantSource: '1', titre: 'PM', employeur: 'X', urlCandidature: 'https://x.test/1',
    }] }) }))
    r.enregistrer(base({ id: 'cassee', recolter: () => { throw new TypeError('boum') } }))

    const b = await r.balayer(r.pour({}), { requete: 'pm' })
    expect(b.sourcesAffirmables).toEqual(['saine'])
    expect(b.sourcesAveugles).toEqual(['cassee'])
    expect(b.resultats.find((x) => x.connecteur === 'cassee')?.etat).toBe('erreur')
    expect(b.resultats.find((x) => x.connecteur === 'saine')?.offres).toHaveLength(1)
  })

  it('le message d’une exception ne fuite pas — une source est du texte non fiable', async () => {
    const r = new Registre()
    r.enregistrer(base({ id: 'hostile', recolter: () => { throw new Error('SECRET-DANS-LE-MESSAGE') } }))
    const b = await r.balayer(r.pour({}), { requete: 'x' })
    expect(JSON.stringify(b)).not.toContain('SECRET-DANS-LE-MESSAGE')
  })

  it('mesure la durée de chaque source', async () => {
    const horloge = vi.fn<() => number>().mockReturnValueOnce(1000).mockReturnValueOnce(1250)
    const r = new Registre()
    r.enregistrer(base())
    const b = await r.balayer(r.pour({}), { requete: 'x' }, horloge)
    expect(b.resultats[0]?.dureeMs).toBe(250)
  })
})
