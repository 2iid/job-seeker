import { describe, expect, it } from 'vitest'
import { estAssistee, plateformeAssistee, PLATEFORMES_ASSISTEES } from './registre.ts'
import { evaluerRedhibitoires, exclusion, peutPostulerSeule, type Criteres, type OffreAEvaluer } from '../../matching/redhibitoires.ts'

const criteres = (o: Partial<Criteres> = {}): Criteres => ({
  zones: [], autorisationTravail: [], presence: [], motsRedhibitoires: [], employeursExclus: [], ...o,
})

const offre = (o: Partial<OffreAEvaluer> = {}): OffreAEvaluer => ({
  titre: 'Product Manager',
  employeurCanonique: 'exemple',
  lieu: null, pays: null, teletravailTexte: null, description: null,
  ...o,
})

describe('le registre — chaque entrée porte son MOTIF', () => {
  it('aucune plateforme n’est classée sans raison', () => {
    // Ce n'est pas une liste de cibles à traiter plus tard. Un motif juridique
    // ne se périme pas parce que l'outillage progresse.
    for (const p of PLATEFORMES_ASSISTEES) {
      expect(p.motif, p.id).toBeTruthy()
      expect(p.explication.length, p.id).toBeGreaterThan(60)
      expect(p.hotes.length, p.id).toBeGreaterThan(0)
    }
  })

  it('l’explication est écrite pour l’utilisateur, pas pour nos notes', () => {
    for (const p of PLATEFORMES_ASSISTEES) {
      expect(p.explication, p.id).toMatch(/vous|votre/i)
    }
  })

  it('reconnaît une plateforme par son HÔTE', () => {
    expect(plateformeAssistee('https://www.linkedin.com/jobs/view/123')?.id).toBe('linkedin')
    expect(plateformeAssistee('https://fr.indeed.com/viewjob?jk=abc')?.id).toBe('indeed')
  })

  it('ne se laisse pas tromper par un hôte qui ressemble', () => {
    // `https://linkedin.com.attaquant.test/` passerait pour LinkedIn si on
    // cherchait la chaîne dans l'URL. Et `?ref=linkedin.com` classerait en
    // palier C une offre qui n'a rien à voir.
    expect(plateformeAssistee('https://linkedin.com.attaquant.test/jobs')).toBeUndefined()
    expect(plateformeAssistee('https://exemple.test/offre?ref=linkedin.com')).toBeUndefined()
    expect(plateformeAssistee('pas une url')).toBeUndefined()
  })

  it('une plateforme ordinaire n’est pas assistée', () => {
    expect(estAssistee('https://boards.greenhouse.io/qonto/jobs/1')).toBe(false)
  })
})

describe('palier C — rien ne part seul, quel que soit le score', () => {
  it('le palier C pose un rédhibitoire, par le PALIER déclaré', () => {
    const b = evaluerRedhibitoires(offre({ palier: 'c' }), criteres())
    expect(b.map((r) => r.code)).toContain('plateforme-assistee')
    expect(peutPostulerSeule(b)).toBe(false)
  })

  it('… et par l’URL, même si le palier n’a pas été renseigné', () => {
    // Une offre peut arriver par un agrégateur qui pointe vers LinkedIn : le
    // palier de la SOURCE serait « b », et l'envoi resterait pourtant interdit.
    const b = evaluerRedhibitoires(
      offre({ palier: 'b', urlCandidature: 'https://www.linkedin.com/jobs/view/9' }),
      criteres(),
    )
    expect(b.map((r) => r.code)).toContain('plateforme-assistee')
    expect(peutPostulerSeule(b)).toBe(false)
  })

  it('ce n’est PAS une exclusion — l’offre est bien présentée', () => {
    // Tout le sens du palier C : « je vous assiste, je ne postule pas ».
    // L'écarter du flux reviendrait à ne pas assister du tout.
    const b = evaluerRedhibitoires(offre({ palier: 'c' }), criteres())
    expect(exclusion(b)).toBeUndefined()
  })

  it('il ne se lève par AUCUN critère', () => {
    // Les autres rédhibitoires décrivent un désaccord entre l'offre et ce que
    // la personne a demandé ; celui-ci décrit ce que NOUS n'avons pas le droit
    // de faire. Aucun réglage ne le franchit.
    const permissif = criteres({
      zones: ['partout'], autorisationTravail: ['FR', 'US', 'SN'],
      presence: ['distanciel', 'hybride', 'presentiel'],
    })
    expect(peutPostulerSeule(evaluerRedhibitoires(offre({ palier: 'c' }), permissif))).toBe(false)
  })

  it('l’explication dit ce que le produit fera À LA PLACE', () => {
    // Un refus qui ne dit pas la suite est une impasse. Ici la suite existe :
    // on prépare le dossier, l'envoi reste le geste de la personne.
    const b = evaluerRedhibitoires(
      offre({ urlCandidature: 'https://www.apec.fr/candidat/offre.html' }),
      criteres(),
    )
    const r = b.find((x) => x.code === 'plateforme-assistee')!
    expect(r.explication).toMatch(/prépare|passer pour vous|votre geste|votre compte/i)
  })

  it('une offre de palier A ou B n’est pas touchée', () => {
    for (const palier of ['a', 'b'] as const) {
      const b = evaluerRedhibitoires(offre({ palier }), criteres())
      expect(b.map((r) => r.code)).not.toContain('plateforme-assistee')
      expect(peutPostulerSeule(b)).toBe(true)
    }
  })
})
