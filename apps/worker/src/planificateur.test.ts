import { describe, expect, it } from 'vitest'
import type { Connecteur, OffreBrute } from './sources/contract.ts'
import { Registre } from './sources/registre.ts'
import { Cadence, EtatDesSources } from './sources/cadence.ts'
import { creerPlanificateur } from './planificateur.ts'

function horlogePilotee(depart = 1_000_000) {
  let t = depart
  return { maintenant: () => t, avancer: (ms: number) => { t += ms } }
}

const offre = (o: Partial<OffreBrute> = {}): OffreBrute => ({
  identifiantSource: '1', titre: 'Product Manager', employeur: 'Qonto',
  urlCandidature: 'https://x.test/1', ...o,
})

const source = (o: Partial<Connecteur> = {}): Connecteur => ({
  id: 'src', palier: 'a', pays: 'monde', secteurs: 'tous',
  latenceAttendueSecondes: 180, regime: 'libre', cadenceMaxParMinute: 2,
  attribution: null,
  recolter: async () => ({ etat: 'ok', offres: [offre()] }),
  ...o,
})

describe('le planificateur orchestre sans rien décider lui-même', () => {
  it('respecte le plafond déclaré par le connecteur', async () => {
    const h = horlogePilotee()
    const r = new Registre()
    r.enregistrer(source({ id: 'lent', cadenceMaxParMinute: 1 }))
    const p = creerPlanificateur(r, { horloge: h.maintenant })

    const t1 = await p.tour({ requete: 'pm' })
    expect(t1.interroges).toEqual(['lent'])
    const t2 = await p.tour({ requete: 'pm' })
    expect(t2.interroges, 'le plafond a été dépassé').toEqual([])
    expect(t2.reportes[0]).toMatchObject({ source: 'lent', motif: 'cadence' })

    h.avancer(60_001)
    expect((await p.tour({ requete: 'pm' })).interroges).toEqual(['lent'])
  })

  it('une source pénalisée est SAUTÉE, pas attendue', async () => {
    // La faire attendre bloquerait les autres : une source en panne
    // pénaliserait tout le balayage au lieu d'elle seule.
    const h = horlogePilotee()
    const cadence = new Cadence(h.maintenant)
    const r = new Registre()
    r.enregistrer(source({ id: 'punie' }))
    r.enregistrer(source({ id: 'saine' }))
    cadence.refuse('punie', 600)

    const p = creerPlanificateur(r, { horloge: h.maintenant, cadence })
    const t = await p.tour({ requete: 'pm' })
    expect(t.interroges).toEqual(['saine'])
    expect(t.reportes[0]).toMatchObject({ source: 'punie', motif: 'penalite' })
    expect(t.offres.length, 'les sources saines ont quand même travaillé').toBeGreaterThan(0)
  })

  it('écoute le délai que la source indique elle-même', async () => {
    const h = horlogePilotee()
    const r = new Registre()
    r.enregistrer(source({
      id: 'quota',
      recolter: async () => ({ etat: 'quota-atteint', offres: [], note: 'retry-after:300' }),
    }))
    const p = creerPlanificateur(r, { horloge: h.maintenant })
    await p.tour({ requete: 'x' })

    h.avancer(120_000)
    // 300 s demandées : à 120 s, on n'y retourne pas.
    expect((await p.tour({ requete: 'x' })).interroges).toEqual([])
    h.avancer(200_000)
    expect((await p.tour({ requete: 'x' })).interroges).toEqual(['quota'])
  })
})

describe('ce que le tour a le droit de dire', () => {
  it('nomme les sources aveugles et ne conclut jamais à une absence', async () => {
    const h = horlogePilotee()
    const r = new Registre()
    r.enregistrer(source({ id: 'muette', recolter: async () => ({ etat: 'injoignable', offres: [] }) }))
    const p = creerPlanificateur(r, { horloge: h.maintenant })
    const t = await p.tour({ requete: 'x' })
    expect(t.aveugles).toEqual(['muette'])
    expect(t.couverture).toMatch(/je ne peux pas dire qu'il n'y a rien/)
  })

  it('quand tout a répondu, le silence devient une vraie information', async () => {
    const h = horlogePilotee()
    const r = new Registre()
    r.enregistrer(source({ id: 'vide', recolter: async () => ({ etat: 'aucun-resultat', offres: [] }) }))
    const t = await creerPlanificateur(r, { horloge: h.maintenant }).tour({ requete: 'x' })
    expect(t.aveugles).toEqual([])
    expect(t.couverture).toMatch(/Rien ne correspondait/)
  })

  it('retient DEPUIS QUAND une source est en panne', async () => {
    const h = horlogePilotee()
    const etats = new EtatDesSources(h.maintenant)
    const r = new Registre()
    r.enregistrer(source({ id: 'ashby', recolter: async () => ({ etat: 'injoignable', offres: [] }) }))
    const p = creerPlanificateur(r, { horloge: h.maintenant, etats })
    await p.tour({ requete: 'x' })
    h.avancer(20 * 60_000)
    await p.tour({ requete: 'x' })
    expect(p.etats.formuler('ashby')).toMatch(/depuis 20 min/)
  })
})

describe('déduplication et attributions', () => {
  it('la même offre sur deux sources devient une entrée, meilleure latence retenue', async () => {
    const h = horlogePilotee()
    const r = new Registre()
    r.enregistrer(source({ id: 'board', palier: 'a', latenceAttendueSecondes: 180 }))
    r.enregistrer(source({ id: 'agreg', palier: 'b', latenceAttendueSecondes: 3600 }))
    const t = await creerPlanificateur(r, { horloge: h.maintenant }).tour({ requete: 'x' })
    expect(t.offres).toHaveLength(1)
    expect(t.offres[0]?.sources[0]?.latenceSecondes).toBe(180)
  })

  it('compte les rejets par motif — un rejet silencieux est une offre ratée', async () => {
    const h = horlogePilotee()
    const r = new Registre()
    r.enregistrer(source({
      id: 'sale',
      recolter: async () => ({ etat: 'ok', offres: [
        offre({ urlCandidature: 'javascript:x' }),
        offre({ identifiantSource: '2', titre: '' }),
      ] }),
    }))
    const t = await creerPlanificateur(r, { horloge: h.maintenant }).tour({ requete: 'x' })
    expect(t.rejets['url-non-http']).toBe(1)
    expect(t.rejets['titre-absent']).toBe(1)
    expect(t.offres).toHaveLength(0)
  })

  it('ne réclame l’attribution que des sources qui ont RÉELLEMENT contribué', async () => {
    // L'afficher pour une source muette serait un crédit inexact.
    const h = horlogePilotee()
    const r = new Registre()
    r.enregistrer(source({ id: 'qui-donne', attribution: 'Offres fournies par X.' }))
    r.enregistrer(source({
      id: 'qui-se-tait', attribution: 'Offres fournies par Y.',
      recolter: async () => ({ etat: 'aucun-resultat', offres: [] }),
    }))
    const t = await creerPlanificateur(r, { horloge: h.maintenant }).tour({ requete: 'x' })
    expect(t.attributions).toEqual(['Offres fournies par X.'])
  })
})
