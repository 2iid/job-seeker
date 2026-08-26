import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { valider } from '../contract.ts'
import { TAILLE_MAX_OCTETS, connecteurAts, etatDepuisStatut } from './connecteur.ts'

const greenhouse = readFileSync(join(import.meta.dirname, 'fixtures', 'greenhouse.json'), 'utf8')

const reponse = (corps: string, init: ResponseInit = {}): typeof globalThis.fetch =>
  (async () => new Response(corps, { status: 200, headers: { 'content-type': 'application/json' }, ...init })) as unknown as typeof globalThis.fetch

const board = { fournisseur: 'greenhouse', slug: 'qonto' } as const

describe('un connecteur ATS respecte le contrat', () => {
  it('se déclare valide', () => {
    expect(valider(connecteurAts(board, 'Qonto'))).toEqual([])
  })

  it('produit un identifiant stable et lisible', () => {
    expect(connecteurAts(board, 'Qonto').id).toBe('ats-greenhouse-qonto')
  })
})

describe('REQ-003 : un échec n’est jamais « aucune offre »', () => {
  it.each([
    [429, 'quota-atteint'],
    [403, 'auth-refusee'],
    [401, 'auth-refusee'],
    [404, 'non-configure'],
    [500, 'injoignable'],
    [503, 'injoignable'],
    [418, 'erreur'],
  ] as const)('un %i devient « %s », jamais aucun-resultat', (statut, attendu) => {
    expect(etatDepuisStatut(statut)).toBe(attendu)
  })

  it('un board qui répond 429 ne fait pas croire à une absence d’offres', async () => {
    const c = connecteurAts(board, 'Qonto', {
      fetch: reponse('', { status: 429, headers: { 'retry-after': '90' } }),
    })
    const r = await c.recolter({ requete: 'pm' })
    expect(r.etat).toBe('quota-atteint')
    expect(r.offres).toEqual([])
    expect(r.note, 'le délai indiqué par la source doit remonter').toContain('90')
  })

  it('du JSON illisible est un CHANGEMENT DE FORMAT, pas une absence', async () => {
    const c = connecteurAts(board, 'Qonto', { fetch: reponse('<html>maintenance</html>') })
    expect((await c.recolter({ requete: 'x' })).etat).toBe('format-change')
  })

  it('un réseau coupé est « injoignable »', async () => {
    const casse = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof globalThis.fetch
    expect((await connecteurAts(board, 'Q', { fetch: casse }).recolter({ requete: 'x' })).etat)
      .toBe('injoignable')
  })

  it('un délai dépassé est distingué d’une panne', async () => {
    const lent = (async () => { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e }) as unknown as typeof globalThis.fetch
    expect((await connecteurAts(board, 'Q', { fetch: lent }).recolter({ requete: 'x' })).etat)
      .toBe('delai-depasse')
  })

  it('un board réellement vide dit « aucun-resultat » — la seule fois où c’est vrai', async () => {
    const c = connecteurAts(board, 'Qonto', { fetch: reponse('{"jobs":[]}') })
    expect((await c.recolter({ requete: 'x' })).etat).toBe('aucun-resultat')
  })

  it('un board qui a des offres dit « ok »', async () => {
    const c = connecteurAts(board, 'GitLab', { fetch: reponse(greenhouse) })
    const r = await c.recolter({ requete: 'x' })
    expect(r.etat).toBe('ok')
    expect(r.offres.length).toBeGreaterThan(0)
  })
})

describe('une réponse démesurée est une panne, pas une aubaine', () => {
  it('refuse de charger au-delà du plafond', async () => {
    const c = connecteurAts(board, 'Qonto', {
      fetch: reponse('{"jobs":[]}', {
        headers: { 'content-type': 'application/json', 'content-length': String(TAILLE_MAX_OCTETS + 1) },
      }),
    })
    const r = await c.recolter({ requete: 'x' })
    expect(r.etat).toBe('format-change')
    expect(r.note).toContain('octets')
  })
})

describe('Workable est déclaré non configuré, pas vide', () => {
  it('ne prétend jamais avoir regardé', async () => {
    // Aucune réponse réelle n'a pu être enregistrée. Un analyseur écrit
    // d'après une documentation renverrait « aucune offre » là où la forme
    // diffère — c'est-à-dire un mensonge silencieux.
    const c = connecteurAts({ fournisseur: 'workable', slug: 'x' }, 'X')
    const r = await c.recolter({ requete: 'x' })
    expect(r.etat).toBe('non-configure')
    expect(r.note).toMatch(/non vérifié/)
  })
})
