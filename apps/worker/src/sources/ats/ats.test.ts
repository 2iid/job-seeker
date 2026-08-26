import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyserAshby, analyserGreenhouse, analyserLever, analyserSmartRecruiters, analyserWorkable } from './parsers.ts'
import { detecterBoard, urlBoard } from './decouverte.ts'

/**
 * Les fixtures sont de VRAIES réponses, enregistrées depuis les API publiques.
 * Un analyseur écrit d'après une documentation renvoie « aucune offre » quand
 * la forme diffère — et REQ-003 interdit de confondre un échec avec une absence.
 */
const fixture = (nom: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `${nom}.json`), 'utf8'))

describe('analyseurs, contre de vraies réponses', () => {
  it('Greenhouse', () => {
    const o = analyserGreenhouse(fixture('greenhouse'), 'GitLab')
    expect(o.length).toBeGreaterThan(0)
    expect(o[0]?.titre).toBeTruthy()
    expect(o[0]?.urlCandidature).toMatch(/^https:\/\//)
    expect(o[0]?.lieu, 'le lieu est imbriqué dans location.name').toBeTruthy()
  })

  it('Ashby', () => {
    const o = analyserAshby(fixture('ashby'), 'Ashby')
    expect(o.length).toBeGreaterThan(0)
    expect(o[0]?.publieeLe, 'publishedAt doit être repris').toBeTruthy()
    expect(o[0]?.urlCandidature).toMatch(/ashbyhq\.com/)
  })

  it('Lever — createdAt est en MILLISECONDES', () => {
    const o = analyserLever(fixture('lever'), 'Lever Demo')
    expect(o.length).toBeGreaterThan(0)
    const annee = new Date(o[0]!.publieeLe!).getUTCFullYear()
    // Traiter des millisecondes comme des secondes daterait toutes les offres
    // de 1970, et le produit afficherait « il y a 56 ans ».
    expect(annee).toBeGreaterThan(2000)
    expect(annee).toBeLessThan(2100)
  })

  it('SmartRecruiters — l’URL doit être postulable, pas une URL d’API', () => {
    const o = analyserSmartRecruiters(fixture('smartrecruiters'), 'smartrecruiters', 'SmartRecruiters')
    expect(o.length).toBeGreaterThan(0)
    expect(o[0]?.urlCandidature).toMatch(/^https:\/\/jobs\.smartrecruiters\.com\//)
    expect(o[0]?.urlCandidature, 'un candidat ne postule pas sur api.smartrecruiters.com')
      .not.toMatch(/api\.smartrecruiters/)
  })

  it('une offre RETIRÉE du board n’est pas collectée', () => {
    // Elle s'afficherait comme disponible alors que plus personne ne peut y
    // postuler.
    const o = analyserAshby({ jobs: [{ id: '1', title: 'X', applyUrl: 'https://a.test/1', isListed: false }] }, 'X')
    expect(o).toEqual([])
  })

  it.each([
    ['greenhouse', analyserGreenhouse],
    ['ashby', analyserAshby],
    ['smartrecruiters', (c: unknown, e: string) => analyserSmartRecruiters(c, 's', e)],
  ] as const)('%s ne fabrique rien à partir de n’importe quoi', (_nom, analyser) => {
    for (const dechet of [null, undefined, 42, 'texte', [], {}, { jobs: 'pas une liste' }]) {
      expect(analyser(dechet, 'X')).toEqual([])
    }
  })

  it('une entrée incomplète est ignorée plutôt que complétée', () => {
    const o = analyserGreenhouse({ jobs: [
      { id: 1, title: 'Sans URL' },
      { id: 2, absolute_url: 'https://x.test/2' },
      { id: 3, title: 'Complète', absolute_url: 'https://x.test/3' },
    ] }, 'X')
    expect(o.map((x) => x.titre)).toEqual(['Complète'])
  })
})

describe('découverte : le slug publié fait autorité', () => {
  it.each([
    ['<a href="https://job-boards.greenhouse.io/qonto/jobs/123">', 'greenhouse', 'qonto'],
    ['<iframe src="https://boards.greenhouse.io/embed/job_board?for=doctolib">', 'greenhouse', 'doctolib'],
    ['<script src="https://jobs.ashbyhq.com/alan/embed"></script>', 'ashby', 'alan'],
    ['<a href="https://jobs.lever.co/swile/abc">', 'lever', 'swile'],
    ['<a href="https://careers.smartrecruiters.com/Pennylane">', 'smartrecruiters', 'Pennylane'],
    ['<a href="https://apply.workable.com/ledger/">', 'workable', 'ledger'],
  ])('lit %s', (html, fournisseur, slug) => {
    expect(detecterBoard(html)).toEqual({ fournisseur, slug })
  })

  it('ne prend JAMAIS un jeton d’URL pour un slug', () => {
    // « embed », « api », « jobs » apparaissent dans les URL d'ATS et
    // produiraient un board d'homonyme, ou un 404 qu'on lirait comme
    // « cette entreprise ne recrute pas ».
    for (const jeton of ['embed', 'api', 'jobs', 'www']) {
      const b = detecterBoard(`https://jobs.lever.co/${jeton}/x`)
      expect(b?.slug, jeton).not.toBe(jeton)
    }
  })

  it('renvoie null quand rien n’est publié — jamais une devinette', () => {
    expect(detecterBoard('<html><body>Nous recrutons ! Écrivez-nous.</body></html>')).toBeNull()
    expect(detecterBoard('')).toBeNull()
  })

  it('construit une URL d’API par fournisseur', () => {
    expect(urlBoard({ fournisseur: 'greenhouse', slug: 'qonto' }))
      .toBe('https://boards-api.greenhouse.io/v1/boards/qonto/jobs')
    expect(urlBoard({ fournisseur: 'ashby', slug: 'alan' }))
      .toBe('https://api.ashbyhq.com/posting-api/job-board/alan')
    expect(urlBoard({ fournisseur: 'lever', slug: 'swile' }))
      .toBe('https://api.lever.co/v0/postings/swile')
  })
})

describe('Workable — écrit contre une réponse RÉELLE (JOB-083)', () => {
  // Enregistrée le 2026-08-26 sur le board public de Skroutz. JOB-021 l'avait
  // laissé non configuré faute de réponse : un analyseur écrit d'après une
  // documentation rend « aucune offre » là où la forme diffère, et REQ-003
  // interdit de confondre un échec avec une absence.
  const charge = fixture('workable')

  it('lit les offres du board', () => {
    const o = analyserWorkable(charge, 'Repli')
    expect(o.length).toBeGreaterThan(0)
    expect(o[0]!.titre).not.toBe('')
    expect(o[0]!.urlCandidature).toMatch(/^https:\/\/apply\.workable\.com\//)
  })

  it('l’identifiant est le `shortcode`, pas le `code` interne', () => {
    // `code` est une référence saisie à la main (« ASMSK 0626 »), parfois vide
    // et jamais garantie unique. Deux offres au code vide fusionneraient.
    const o = analyserWorkable(charge, 'Repli')
    expect(o[0]!.identifiantSource).toMatch(/^[A-Z0-9]{8,}$/)
    expect(o[0]!.identifiantSource).not.toContain(' ')
  })

  it('l’employeur vient du board, pas du repli', () => {
    expect(analyserWorkable(charge, 'Repli')[0]!.employeur).not.toBe('Repli')
  })

  it('l’URL retenue mène au FORMULAIRE, pas seulement à l’annonce', () => {
    // C'est là qu'on postule, et l'annonce y est atteignable depuis.
    expect(analyserWorkable(charge, 'X')[0]!.urlCandidature).toMatch(/\/apply$/)
  })

  it('la date est celle de la MISE EN LIGNE, pas de la création du brouillon', () => {
    // Une offre créée en janvier et publiée en août paraîtrait vieille de sept
    // mois si on prenait `created_at`.
    const j = (charge as { jobs: Record<string, unknown>[] }).jobs[0]!
    expect(analyserWorkable(charge, 'X')[0]!.publieeLe).toBe(j['published_on'])
  })

  it('le lieu porte le code pays ISO quand `locations` le donne', () => {
    const lieu = analyserWorkable(charge, 'X')[0]!.lieu
    expect(lieu).toMatch(/GR$/)
  })

  it('un lieu marqué `hidden` n’est pas publié à la place de l’employeur', () => {
    const cache = {
      name: 'X',
      jobs: [{
        title: 'T', shortcode: 'AAAAAAAA', application_url: 'https://apply.workable.com/j/A/apply',
        locations: [{ city: 'Secret', countryCode: 'FR', hidden: true }],
        city: 'Paris', country: 'France',
      }],
    }
    const lieu = analyserWorkable(cache, 'X')[0]!.lieu
    expect(lieu).not.toContain('Secret')
    expect(lieu).toContain('Paris')
  })

  it('`telecommuting: false` ne devient PAS « présentiel »', () => {
    // `false` peut vouloir dire « présentiel » comme « personne n'a coché la
    // case ». En faire un rédhibitoire écarterait des offres sur un défaut de
    // saisie de l'employeur.
    for (const o of analyserWorkable(charge, 'X')) {
      expect(o.teletravailTexte).toBeUndefined()
    }
  })

  it('`telecommuting: true` est rendu, lui', () => {
    const distant = {
      name: 'X',
      jobs: [{ title: 'T', shortcode: 'BBBBBBBB', application_url: 'https://apply.workable.com/j/B/apply', telecommuting: true }],
    }
    expect(analyserWorkable(distant, 'X')[0]!.teletravailTexte).toBe('distanciel')
  })

  it('une forme inattendue rend une liste VIDE, jamais une exception', () => {
    // Le connecteur transforme alors ce vide en `format-change` : c'est là que
    // se joue « je n'ai pas su lire » plutôt que « il n'y a rien ».
    expect(analyserWorkable({ jobs: 'pas un tableau' }, 'X')).toEqual([])
    expect(analyserWorkable(null, 'X')).toEqual([])
    expect(analyserWorkable({ jobs: [{ sans: 'titre' }] }, 'X')).toEqual([])
  })
})
