import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { valider } from '../contract.ts'
import { lireRemuneration, versDecimal } from '../normalisation.ts'
import { analyserArbeitnow, analyserJobicy, analyserRemotive } from './parsers.ts'
import { connecteursAgregateurs } from './connecteurs.ts'

const fixture = (nom: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `${nom}.json`), 'utf8'))

describe('analyseurs du palier B, contre de vraies réponses', () => {
  it('Arbeitnow — created_at est en SECONDES', () => {
    const o = analyserArbeitnow(fixture('arbeitnow'))
    expect(o.length).toBeGreaterThan(0)
    const annee = new Date(o[0]!.publieeLe!).getUTCFullYear()
    // Lever date en millisecondes, Arbeitnow en secondes. Confondre les deux
    // place l'offre en 1970 ou dans un futur lointain — deux sources, deux
    // unités, et aucune documentation ne le dit.
    expect(annee).toBeGreaterThan(2000)
    expect(annee).toBeLessThan(2100)
  })

  it('Remotive', () => {
    const o = analyserRemotive(fixture('remotive'))
    expect(o.length).toBeGreaterThan(0)
    expect(o[0]?.urlCandidature).toMatch(/^https:\/\//)
    expect(o[0]?.teletravailTexte).toBe('distanciel')
  })

  it('Jobicy — le salaire en champs séparés repasse par le SEUL interpréteur', () => {
    const o = analyserJobicy(fixture('jobicy'))
    expect(o.length).toBeGreaterThan(0)
    const avecSalaire = o.find((x) => x.remunerationTexte !== undefined)
    if (avecSalaire !== undefined) {
      const r = lireRemuneration(avecSalaire.remunerationTexte)
      expect(r, 'le texte recomposé doit être lisible par lireRemuneration').not.toBeNull()
      expect(versDecimal(r!.min!)).toBeGreaterThan(1000)
      expect(r?.periode).toBe('an')
    }
  })

  it.each([
    ['arbeitnow', analyserArbeitnow],
    ['remotive', analyserRemotive],
    ['jobicy', analyserJobicy],
  ] as const)('%s ne fabrique rien à partir de n’importe quoi', (_n, analyser) => {
    for (const dechet of [null, undefined, 42, 'x', [], {}, { jobs: 'pas une liste' }, { data: 5 }]) {
      expect(analyser(dechet)).toEqual([])
    }
  })
})

describe('les conditions des sources sont portées par le contrat', () => {
  const cs = connecteursAgregateurs()

  it('tous les connecteurs respectent le contrat', () => {
    for (const c of cs) expect(valider(c), c.id).toEqual([])
  })

  it('Remotive déclare son retard de 24 h, annoncé par la source elle-même', () => {
    // La déclarer à une heure ferait afficher « vue il y a 12 min » sur une
    // offre qui a déjà un jour — un mensonge sur la seule promesse du produit.
    const r = cs.find((c) => c.id === 'agregateur-remotive')
    expect(r?.latenceAttendueSecondes).toBeGreaterThanOrEqual(86_400)
  })

  it('les sources qui EXIGENT une attribution la déclarent', () => {
    // Sans elle, Remotive coupe l'accès. Une obligation légale portée par la
    // mémoire de quelqu'un est une obligation qu'on oublie au troisième écran.
    for (const id of ['agregateur-remotive', 'agregateur-jobicy']) {
      const c = cs.find((x) => x.id === id)
      expect(c?.attribution, id).toBeTruthy()
      expect(c?.attribution, id).toMatch(/lien/i)
    }
  })

  it('aucun agrégateur ne se déclare palier A', () => {
    for (const c of cs) expect(c.palier, c.id).toBe('b')
  })

  it('la cadence du palier B est plus prudente que celle d’un board', () => {
    for (const c of cs) expect(c.cadenceMaxParMinute).toBeLessThanOrEqual(6)
  })
})

describe('un agrégateur en panne ne dit jamais « aucune offre »', () => {
  const avec = (init: ResponseInit, corps = '') =>
    connecteursAgregateurs({
      fetch: (async () => new Response(corps, init)) as unknown as typeof globalThis.fetch,
    })[0]!

  it.each([
    [429, 'quota-atteint'],
    [500, 'injoignable'],
    [403, 'auth-refusee'],
  ] as const)('un %i devient « %s »', async (status, attendu) => {
    expect((await avec({ status }).recolter({ requete: 'x' })).etat).toBe(attendu)
  })

  it('du HTML de maintenance est un changement de format', async () => {
    const c = avec({ status: 200 }, '<html>maintenance</html>')
    expect((await c.recolter({ requete: 'x' })).etat).toBe('format-change')
  })

  it('une liste réellement vide est la seule « aucun-resultat » légitime', async () => {
    const c = avec({ status: 200, headers: { 'content-type': 'application/json' } }, '{"data":[]}')
    expect((await c.recolter({ requete: 'x' })).etat).toBe('aucun-resultat')
  })
})
