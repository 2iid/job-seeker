import { describe, expect, it, vi } from 'vitest'
import { decouvrir, lireReponse, paysSupportes, requete } from './employeurs.ts'
import { examinerPage, liensCarrieres, planDeTravail, sonder, type Constat } from './sonde.ts'

const reponse = (corps: string, statut = 200): Response =>
  new Response(corps, { status: statut, headers: { 'content-type': 'text/html' } })

describe('requete SPARQL', () => {
  it('rend null pour un pays hors de la table', () => {
    // Fabriquer une requête pour un pays qu'on n'a pas cartographié rendrait
    // zéro résultat — et zéro résultat se lit « aucun employeur ici », ce qui
    // est exactement le mensonge que ce module existe pour éviter.
    expect(requete('sante', 'ZZ', 10)).toBeNull()
    expect(requete('sante', 'FR', 10)).toContain('wd:Q142')
  })

  it('n’emploie PAS la traversée de sous-classes', () => {
    // Avec `/wdt:P279*`, la requête dépassait le délai du service sur la
    // France — deux refus de suite. Un délai dépassé se présente chez nous
    // comme « aucun employeur trouvé » : la mesure aurait confirmé son propre
    // défaut.
    expect(requete('sante', 'FR', 10)).not.toContain('P279')
  })

  it('borne la limite', () => {
    expect(requete('sante', 'FR', 100_000)).toContain('LIMIT 500')
    expect(requete('sante', 'FR', -5)).toContain('LIMIT 1')
  })

  it('couvre des marchés hors Europe et Amérique du Nord', () => {
    // C'est la raison d'être du module : JOB-076 a mesuré zéro offre en
    // Afrique et zéro en Amérique du Sud hors Mexique.
    for (const p of ['SN', 'CI', 'MA', 'CM', 'BR', 'CO', 'IN', 'TN']) {
      expect(paysSupportes(), p).toContain(p)
    }
  })
})

describe('lireReponse', () => {
  const binding = (nom: string, site: string, id = 'http://www.wikidata.org/entity/Q1') => ({
    e: { value: id }, eLabel: { value: nom }, site: { value: site },
  })

  it('lit les employeurs', () => {
    const r = lireReponse({ results: { bindings: [binding('Hôpital X', 'https://hx.fr')] } }, 'sante', 'fr')
    expect(r).toEqual([{
      nom: 'Hôpital X', site: 'https://hx.fr', secteur: 'sante', pays: 'FR',
      source: 'wikidata', identifiant: 'http://www.wikidata.org/entity/Q1',
    }])
  })

  it('écarte un label non traduit', () => {
    // Wikidata rend l'identifiant brut quand il n'a pas de libellé : « Q12345 »
    // n'est pas un nom d'employeur, et l'enregistrer polluerait le registre.
    expect(lireReponse({ results: { bindings: [binding('Q98765', 'https://x.fr')] } }, 'sante', 'FR'))
      .toEqual([])
  })

  it('dédoublonne par HÔTE — c’est lui qu’on sondera', () => {
    const r = lireReponse({
      results: {
        bindings: [
          binding('Hôpital X', 'https://hx.fr/a', 'Q1'),
          binding('Hôpital X (bis)', 'https://hx.fr/b', 'Q2'),
        ],
      },
    }, 'sante', 'FR')
    expect(r).toHaveLength(1)
  })

  it('ne tombe pas sur une réponse malformée', () => {
    expect(lireReponse(null, 'sante', 'FR')).toEqual([])
    expect(lireReponse({ results: { bindings: 'pas un tableau' } }, 'sante', 'FR')).toEqual([])
    expect(lireReponse({ results: { bindings: [{ eLabel: { value: 'X' } }] } }, 'sante', 'FR')).toEqual([])
  })
})

describe('decouvrir — un échec n’est pas une absence', () => {
  it('déclare son agent, comme Wikidata l’exige', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response('{}', { status: 200 }))
    await decouvrir('sante', 'FR', { fetch: f as never, contact: 'moi@exemple.test' })
    const entetes = f.mock.calls[0]![1]!.headers as Record<string, string>
    expect(entetes['user-agent']).toContain('moi@exemple.test')
  })

  it('un service injoignable n’est pas « aucun employeur »', async () => {
    const r = await decouvrir('sante', 'FR', {
      fetch: (async () => { throw new Error('ECONNREFUSED') }) as never,
    })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.etat).toBe('injoignable')
  })

  it('un pays non cartographié est REFUSÉ, pas silencieusement vide', async () => {
    const r = await decouvrir('sante', 'ZZ', { fetch: (async () => reponse('{}')) as never })
    expect(r.ok === false && r.etat).toBe('refuse')
    expect(r.ok === false && r.note).toContain('ZZ')
  })
})

describe('examinerPage — l’ordre est une précédence, pas une commodité', () => {
  it('un anti-robot passe AVANT un board connu', () => {
    // Une page qui porte les deux ne doit pas être classée lisible : on
    // enverrait le moteur se faire bloquer en boucle.
    const c = examinerPage(
      '<a href="https://boards.greenhouse.io/x/">jobs</a><script src="captcha.perfdrive.com/x.js">',
      '/',
    )
    expect(c.type).toBe('assiste')
  })

  it('reconnaît un board ATS connu', () => {
    const c = examinerPage('<a href="https://boards.greenhouse.io/qonto/">', '/')
    expect(c.type).toBe('lisible')
    expect(c.type === 'lisible' && c.board.fournisseur).toBe('greenhouse')
  })

  it('reconnaît du JobPosting', () => {
    expect(examinerPage('<script type="application/ld+json">{"@type":"JobPosting"}</script>', '/').type)
      .toBe('lisible-jsonld')
  })

  it('NOMME une plateforme qu’on ne sait pas encore lire', () => {
    // La sortie la plus utile du module. En sondant cinq hôpitaux français on
    // a trouvé `mstaff.co`, un ATS sectoriel santé dont personne n'avait
    // entendu parler.
    const c = examinerPage('<iframe src="https://chu.mstaff.co/offres"></iframe>', '/recrutement')
    expect(c.type).toBe('plateforme-inconnue')
    expect(c.type === 'plateforme-inconnue' && c.plateforme).toBe('mstaff.co')
  })

  it('rien, c’est rien', () => {
    expect(examinerPage('<html><body>Bienvenue</body></html>', '/').type).toBe('rien')
  })
})

describe('liensCarrieres — un employeur sur deux recrute ailleurs', () => {
  it('trouve un lien de recrutement vers un AUTRE domaine', () => {
    // Le défaut qui a fait rendre « rien » au CHU de Nantes, dont le site de
    // recrutement est un domaine à part — et où se trouvait `mstaff.co`.
    const html = '<a href="https://www.rejoignez-le-chu.fr/">Nous recrutons</a>'
    expect(liensCarrieres(html, 'https://www.chu.fr')).toEqual(['https://www.rejoignez-le-chu.fr/'])
  })

  it('résout un lien relatif', () => {
    expect(liensCarrieres('<a href="/emploi">Carrières</a>', 'https://x.fr'))
      .toEqual(['https://x.fr/emploi'])
  })

  it('ignore les ancres, les mailto et les href malformés', () => {
    const html = '<a href="#recrutement">Recrutement</a><a href="mailto:rh@x.fr">Nous rejoindre</a>'
    expect(liensCarrieres(html, 'https://x.fr')).toEqual([])
  })

  it('ne se déclenche pas sur un lien sans rapport', () => {
    expect(liensCarrieres('<a href="/actualites">Actualités</a>', 'https://x.fr')).toEqual([])
  })
})

describe('sonder — un seul saut, et on s’arrête dès qu’on a trouvé', () => {
  it('suit le lien de carrières vers un autre domaine', async () => {
    const pages: Record<string, string> = {
      'https://chu.fr': '<a href="https://rejoignez-chu.fr/">Nous recrutons</a>',
      'https://rejoignez-chu.fr/': '<iframe src="https://x.mstaff.co/o"></iframe>',
    }
    const f = vi.fn(async (u: string) =>
      pages[u] !== undefined ? reponse(pages[u]!) : reponse('', 404))
    const c = await sonder('https://chu.fr', { fetch: f as never })
    expect(c.type).toBe('plateforme-inconnue')
    expect(c.type === 'plateforme-inconnue' && c.plateforme).toBe('mstaff.co')
  })

  it('s’arrête dès qu’un board lisible est trouvé', async () => {
    // Continuer chargerait douze pages du site de quelqu'un pour rien — et se
    // comporter en nuisible chez un employeur qu'on espère interroger tous les
    // jours serait un mauvais calcul.
    const f = vi.fn(async (_u: string) => reponse('<a href="https://boards.greenhouse.io/qonto/">'))
    await sonder('https://x.fr', { fetch: f as never })
    expect(f.mock.calls.length).toBe(1)
  })

  it('ne charge jamais deux fois la même URL', async () => {
    const f = vi.fn(async (_u: string) => reponse('<html>rien</html>'))
    await sonder('https://x.fr/', { fetch: f as never })
    const urls = f.mock.calls.map((c) => c[0])
    expect(new Set(urls).size).toBe(urls.length)
  })
})

describe('planDeTravail — le vrai produit de la découverte', () => {
  it('classe les plateformes inconnues par nombre d’employeurs', () => {
    // C'est ce qui transforme « il faudrait plus de sources » en « écris le
    // connecteur mstaff, il ouvre N hôpitaux ». Une découverte qui rend une
    // liste d'échecs n'aide personne.
    const constats: Constat[] = [
      { type: 'plateforme-inconnue', plateforme: 'mstaff.co', ou: '/r' },
      { type: 'plateforme-inconnue', plateforme: 'mstaff.co', ou: '/r' },
      { type: 'plateforme-inconnue', plateforme: 'taleez.com', ou: '/r' },
      { type: 'rien' },
      { type: 'assiste', dispositif: 'datadome', ou: '/' },
    ]
    expect(planDeTravail(constats)).toEqual([
      { plateforme: 'mstaff.co', employeurs: 2 },
      { plateforme: 'taleez.com', employeurs: 1 },
    ])
  })
})
