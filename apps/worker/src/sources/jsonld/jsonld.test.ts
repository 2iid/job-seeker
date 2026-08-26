import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { aLeType, analyserSansPollution, aplatir, extraireJsonLd } from './extraire.ts'
import { lireJobPostings, lieuDe, remunerationTexte, texteDeDescription } from './jobposting.ts'
import { connecteurPageCarrieres } from './connecteur.ts'
import { couvertureAffirmable, estAveugle, valider } from '../contract.ts'

/**
 * Ces fixtures sont ÉCRITES depuis la spécification, pas relevées — voir
 * `fixtures/PROVENANCE.md`, qui dit pourquoi c'est acceptable ici et ne l'est
 * pas pour un connecteur ATS.
 */
const page = (nom: string): string =>
  readFileSync(new URL(`./fixtures/${nom}`, import.meta.url), 'utf8')

const MAINTENANT = new Date('2026-08-26T12:00:00Z')
const lire = (nom: string) => lireJobPostings(extraireJsonLd(page(nom)).blocs, MAINTENANT)

describe('extraction — une page tierce est une entrée, pas une réponse', () => {
  it('un bloc illisible n’interrompt pas les autres', () => {
    // Une page qui porte un JSON-LD cassé et deux valides doit rendre les
    // deux. Abandonner sur le premier traiterait le défaut d'un tiers comme
    // une absence d'offres — ce que REQ-003 interdit.
    const e = extraireJsonLd(page('page-hostile.html'))
    expect(e.blocs).toHaveLength(2)
    expect(e.ignores.filter((i) => i.raison === 'illisible')).toHaveLength(1)
  })

  it('un bloc démesuré est écarté et COMPTÉ', () => {
    // Construit ici : six cents kilo-octets de « x » dans le dépôt seraient
    // six cents kilo-octets à cloner, pour éprouver une borne d'une ligne.
    const enorme = `<script type="application/ld+json">{"@type":"JobPosting","title":"${'x'.repeat(600_000)}"}</script>`
    const e = extraireJsonLd(enorme)
    expect(e.blocs).toEqual([])
    expect(e.ignores[0]?.raison).toBe('trop-gros')
  })

  it('`__proto__` ne pollue rien', () => {
    // `JSON.parse` accepte volontiers cette clé ; l'affecter ensuite polluerait
    // le prototype de tout le processus. Une défense qui ne coûte rien et dont
    // l'absence ne se voit qu'après.
    const o = analyserSansPollution('{"a":1,"__proto__":{"pollue":true}}') as Record<string, unknown>
    expect(o['a']).toBe(1)
    expect(Object.prototype.hasOwnProperty.call(o, '__proto__')).toBe(false)
    expect(({} as Record<string, unknown>)['pollue']).toBeUndefined()
  })

  it('la profondeur de `@graph` est bornée', () => {
    // Un document construit pour ça ferait déborder la pile — et une pile qui
    // déborde arrête le worker, pas seulement cette source.
    let poupee: unknown = { '@type': 'JobPosting', title: 'trop profond' }
    for (let i = 0; i < 12; i += 1) poupee = { '@graph': [poupee] }
    expect(aplatir(poupee)).toEqual([])
  })

  it('un `@graph` raisonnablement imbriqué est bien lu', () => {
    const r = lire('page-hostile.html')
    expect(r.offres.map((o) => o.titre)).toContain('Imbriquée')
  })

  it('`@type` peut être une chaîne ou un tableau', () => {
    expect(aLeType({ '@type': 'JobPosting' }, 'JobPosting')).toBe(true)
    expect(aLeType({ '@type': ['Thing', 'JobPosting'] }, 'JobPosting')).toBe(true)
    expect(aLeType({ '@type': 'Organization' }, 'JobPosting')).toBe(false)
    expect(aLeType({}, 'JobPosting')).toBe(false)
  })
})

describe('lecture d’un JobPosting', () => {
  it('la forme la plus fréquente : un objet seul', () => {
    const { offres } = lire('page-simple.html')
    expect(offres).toHaveLength(1)
    const o = offres[0]!
    expect(o.titre).toBe('Chargée de communication')
    expect(o.employeur).toBe('Coopérative du Fleuve')
    expect(o.urlCandidature).toBe('https://exemple.test/carrieres/chargee-communication')
    expect(o.identifiantSource).toBe('COM-2026-14')
    expect(o.lieu).toBe('Dakar, SN')
  })

  it('un `@graph` avec `@type` en tableau est lu comme un objet seul', () => {
    const { offres } = lire('page-graphe.html')
    expect(offres.map((x) => x.titre)).toEqual(['Senior Backend Engineer'])
  })

  it('le distanciel n’est rendu que s’il est DÉCLARÉ', () => {
    // Inventer « présentiel » parce que le champ est absent le transformerait
    // en rédhibitoire pour quelqu'un.
    expect(lire('page-graphe.html').offres[0]?.teletravailTexte).toContain('distanciel')
    expect(lire('page-simple.html').offres[0]?.teletravailTexte).toBeUndefined()
  })

  it('l’identifiant se rabat sur l’URL, jamais sur le titre', () => {
    // Deux postes homonymes ouverts dans deux villes fusionneraient.
    const { offres } = lire('page-graphe.html')
    expect(offres[0]?.identifiantSource).toBe('https://exemple.test/jobs/42')
  })
})

describe('ce qui est REFUSÉ, et compté', () => {
  it('une offre expirée n’entre pas dans le flux', () => {
    // Envoyer dans le vide est pire que ne rien envoyer : la personne croit
    // que l'agent travaille pendant qu'il ne se passe rien.
    const r = lire('page-liste.html')
    expect(r.offres.map((o) => o.titre)).not.toContain('Infirmier coordinateur')
    expect(r.ignorees).toContainEqual({ raison: 'expiree', titre: 'Infirmier coordinateur' })
  })

  it('une offre sans URL de candidature n’entre pas non plus', () => {
    // Elle remplirait le flux d'offres sur lesquelles on ne peut rien faire.
    const r = lire('page-liste.html')
    expect(r.ignorees).toContainEqual({ raison: 'sans-url', titre: 'Poste sans lien' })
  })

  it('une offre expirée redevient valide si on la lit AVANT sa date', () => {
    // La borne est comparée à un instant qu'on passe : la fonction ne lit pas
    // l'horloge, donc le test ne dépend pas du jour où il tourne.
    const tot = lireJobPostings(extraireJsonLd(page('page-liste.html')).blocs, new Date('2026-01-01T00:00:00Z'))
    expect(tot.offres.map((o) => o.titre)).toContain('Infirmier coordinateur')
  })
})

describe('la description arrive en TEXTE', () => {
  it('le balisage est retiré et les sauts de ligne conservés', () => {
    const o = lire('page-liste.html').offres.find((x) => x.titre === 'Aide-soignant de nuit')
    expect(o?.description).toBe('Service de nuit.\nRoulement 3 nuits.')
  })

  it('un `<script>` est retiré avec son contenu', () => {
    // Ce texte part ensuite vers un modèle, un journal, peut-être un écran.
    // Transporter du HTML dont on n'a pas besoin, c'est se créer un problème.
    const o = lire('page-liste.html').offres.find((x) => x.titre === 'Aide-soignant de nuit')
    expect(o?.description).not.toContain('alert')
  })

  it('les entités sont rétablies', () => {
    expect(texteDeDescription('<p>R&amp;D &lt;senior&gt;&nbsp;requis</p>')).toBe('R&D <senior> requis')
  })
})

describe('les valeurs composées de schema.org', () => {
  it('un lieu peut être une chaîne, un Place, ou un tableau', () => {
    expect(lieuDe('Paris')).toBe('Paris')
    expect(lieuDe({ address: { addressLocality: 'Lyon', addressCountry: 'FR' } })).toBe('Lyon, FR')
    expect(lieuDe([{ address: { addressLocality: 'Nantes' } }])).toBe('Nantes')
    expect(lieuDe(undefined)).toBeUndefined()
  })

  it('le lieu ne répète pas un segment identique', () => {
    expect(lieuDe({ address: { addressLocality: 'Singapore', addressCountry: 'Singapore' } }))
      .toBe('Singapore')
  })

  it('le salaire est rendu en TEXTE, pour que `lireRemuneration` le relise', () => {
    // Poser ici une seconde lecture des rémunérations garantirait que les deux
    // divergent — celle de `normalisation.ts` a déjà ses pièges résolus.
    expect(remunerationTexte({
      currency: 'CAD',
      value: { minValue: 120000, maxValue: 155000, unitText: 'YEAR' },
    })).toBe('120000 - 155000 CAD / an')

    expect(remunerationTexte({
      currency: 'XOF', value: { value: 1200000, unitText: 'MONTH' },
    })).toBe('1200000 XOF / mois')
  })

  it('la période est celle que la page déclare, jamais supposée', () => {
    // Un montant mensuel lu comme annuel se trompe d'un facteur douze — le
    // défaut exact que `normalisation.ts` a déjà corrigé une fois.
    expect(remunerationTexte({ currency: 'EUR', value: { value: 3500, unitText: 'MONTH' } }))
      .toContain('/ mois')
    expect(remunerationTexte({ currency: 'EUR', value: { value: 3500 } }))
      .not.toContain('/')
  })
})

describe('le connecteur — un échec n’est jamais une absence (REQ-003)', () => {
  const reponse = (corps: string, statut = 200): Response =>
    new Response(corps, { status: statut, headers: { 'content-type': 'text/html' } })

  const connecteur = (f: () => Promise<Response>) =>
    connecteurPageCarrieres(
      { id: 'carrieres-exemple', url: 'https://exemple.test/carrieres', pays: ['SN'] },
      { fetch: f as never, maintenant: () => MAINTENANT },
    )

  it('lit les offres d’une page valide', async () => {
    const r = await connecteur(async () => reponse(page('page-simple.html'))).recolter({ requete: 'x' })
    expect(r.etat).toBe('ok')
    expect(r.offres).toHaveLength(1)
  })

  it('une page SANS donnée structurée est « format-change », pas « aucun-resultat »', async () => {
    // La distinction est tout le ticket. « aucun-resultat » autorise à dire
    // « rien pour vous aujourd'hui » ; le dire d'une page qu'on n'a pas su
    // lire ferait manquer un employeur qui recrutait.
    const r = await connecteur(async () => reponse('<html><body>Nos offres</body></html>')).recolter({ requete: 'x' })
    expect(r.etat).toBe('format-change')
    expect(couvertureAffirmable(r.etat)).toBe(false)
    expect(estAveugle(r.etat)).toBe(true)
  })

  it('des blocs lus sans aucun JobPosting sont aussi « format-change »', async () => {
    const autre = '<script type="application/ld+json">{"@type":"Organization","name":"X"}</script>'
    const r = await connecteur(async () => reponse(autre)).recolter({ requete: 'x' })
    expect(r.etat).toBe('format-change')
  })

  it('une offre écartée rend la récolte PARTIELLE, jamais complète', async () => {
    // Deux offres retenues sur trois n'est pas une couverture : le dire
    // « ok » laisserait conclure qu'on a tout vu.
    const r = await connecteur(async () => reponse(page('page-liste.html'))).recolter({ requete: 'x' })
    expect(r.etat).toBe('partiel')
    expect(couvertureAffirmable(r.etat)).toBe(false)
    expect(r.note).toMatch(/écartée/)
  })

  it('une page injoignable ne rend pas zéro offre en silence', async () => {
    const r = await connecteur(async () => { throw new Error('ECONNREFUSED') }).recolter({ requete: 'x' })
    expect(r.etat).toBe('injoignable')
    expect(estAveugle(r.etat)).toBe(true)
  })

  it('une page démesurée est « partiel » et le dit', async () => {
    const r = await connecteur(async () => reponse('x'.repeat(5 * 1024 * 1024))).recolter({ requete: 'x' })
    expect(r.etat).toBe('partiel')
    expect(r.note).toMatch(/Ko/)
  })

  it('la cadence reste basse : c’est le site de quelqu’un, pas une API', async () => {
    const c = connecteur(async () => reponse('<html></html>'))
    expect(c.cadenceMaxParMinute).toBeLessThanOrEqual(2)
    expect(c.palier).toBe('a')
  })

  it('le connecteur satisfait le contrat avant d’entrer dans le registre', () => {
    expect(valider(connecteur(async () => reponse('<html></html>')))).toEqual([])
  })
})
