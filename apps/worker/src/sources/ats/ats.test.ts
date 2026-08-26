import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyserAshby, analyserGreenhouse, analyserLever, analyserSmartRecruiters } from './parsers.ts'
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
