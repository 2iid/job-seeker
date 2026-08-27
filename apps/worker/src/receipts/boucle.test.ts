import { describe, expect, it, vi } from 'vitest'
import {
  etatInitial, evaluerReconciliation, RETARD_TOLERE_MS, unTour, type EtatBoucle,
} from './boucle.ts'

const T0 = new Date('2026-08-27T12:00:00Z')
const plus = (ms: number) => new Date(T0.getTime() + ms)
const dbQui = (impl: () => Promise<unknown>) => ({ query: vi.fn(impl) }) as never

describe('un tour de réconciliation', () => {
  it('note sa réussite', async () => {
    const etat = etatInitial()
    await unTour(dbQui(async () => ({ rows: [], rowCount: 0 })), etat, () => T0)
    expect(etat.derniereReussite).toEqual(T0)
    expect(etat.toursReussis).toBe(1)
  })

  it('N’ÉCRASE PAS le worker quand la base tombe', async () => {
    // Une erreur de réconciliation ne doit pas tuer un processus qui a d'autres
    // choses à faire. Elle est retenue, et la sonde la rendra visible.
    const etat = etatInitial()
    const bilan = await unTour(dbQui(async () => { throw new Error('ECONNREFUSED') }), etat)
    expect(bilan).toBeNull()
    expect(etat.derniereErreur).toMatch(/ECONNREFUSED/)
    expect(etat.derniereReussite).toBeNull()
  })

  it('ne lance pas deux tours en parallèle', async () => {
    // Sur une base chargée, un tour peut dépasser son intervalle. Deux tours
    // simultanés doubleraient le travail exactement quand la base souffre.
    const etat: EtatBoucle = { ...etatInitial(), enCours: true }
    expect(await unTour(dbQui(async () => ({ rows: [] })), etat)).toBeNull()
  })

  it('relâche le verrou même en cas d’erreur', async () => {
    const etat = etatInitial()
    await unTour(dbQui(async () => { throw new Error('x') }), etat)
    expect(etat.enCours).toBe(false)
  })
})

describe('la santé du DÉTECTEUR, pas seulement de ce qu’il trouve', () => {
  it('tolère de n’avoir jamais tourné, juste après le démarrage', () => {
    // Sans cette tolérance, le worker naîtrait dégradé et l'alerte perdrait
    // tout son sens dès la première minute.
    const s = evaluerReconciliation(etatInitial(), plus(1000), T0)
    expect(s.ok).toBe(true)
  })

  it('mais pas indéfiniment', () => {
    const s = evaluerReconciliation(etatInitial(), plus(RETARD_TOLERE_MS + 1), T0)
    expect(s.ok).toBe(false)
    expect(s.raison).toMatch(/jamais abouti/)
  })

  it('DÉGRADE quand la recherche de trous s’est arrêtée', () => {
    // La forme de panne la plus coûteuse : un détecteur arrêté produit zéro
    // incident, ce qui ressemble exactement à « tout va bien ».
    const etat: EtatBoucle = { ...etatInitial(), derniereReussite: T0 }
    const s = evaluerReconciliation(etat, plus(RETARD_TOLERE_MS + 1), T0)
    expect(s.ok).toBe(false)
    expect(s.raison).toMatch(/n’a pas abouti depuis/)
  })

  it('reste sain tant que le retard est dans la tolérance', () => {
    // Une période de retard est un hasard d'ordonnancement ; trois, une panne.
    const etat: EtatBoucle = { ...etatInitial(), derniereReussite: T0 }
    expect(evaluerReconciliation(etat, plus(RETARD_TOLERE_MS - 1), T0).ok).toBe(true)
  })
})
