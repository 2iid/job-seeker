import { describe, expect, it } from 'vitest'
import { expliquerRejeu, rejouer, type Instantane } from './replay.ts'
import { fuites, resumerPourScoring, villeSeule, type ProfilComplet } from './resume.ts'
import type { Criteres, OffreAEvaluer } from './redhibitoires.ts'

const TEXTE = 'Product Manager senior chez Qonto. Expérience en fintech exigée. Hybride 2 jours à Paris.'

const offre = (o: Partial<OffreAEvaluer> = {}): OffreAEvaluer => ({
  titre: 'Product Manager', employeurCanonique: 'qonto', lieu: 'Paris', pays: 'FR',
  teletravailTexte: 'hybride', description: null, ...o,
})

const criteres = (o: Partial<Criteres> = {}): Criteres => ({
  zones: ['Paris'], autorisationTravail: ['FR'], presence: ['distanciel', 'hybride'],
  motsRedhibitoires: [], employeursExclus: [], ...o,
})

const PROFIL: ProfilComplet = {
  nomComplet: 'Amina Diallo',
  email: 'amina.diallo@example.sn',
  telephone: '+221 77 000 00 00',
  localisation: '12 rue des Lilas, Dakar, Sénégal',
  titreAccroche: 'Cheffe de projet marketing',
  experiences: [{
    employeur: 'Wave Sénégal', intitule: 'Responsable acquisition',
    debut: '2021-03-14', fin: null, description: 'Pilotage du budget d’acquisition.',
  }],
  formations: [{ intitule: 'Master Marketing', etablissement: 'ISM Dakar', obtenueEn: 2019 }],
  competences: ['SQL'], langues: ['français', 'anglais'],
}

const instantane = (o: Partial<Instantane> = {}): Instantane => ({
  opportuniteId: 'o1',
  evalueLe: '2026-08-26T10:00:00Z',
  texteOffre: TEXTE,
  offre: offre(),
  criteres: criteres(),
  resumeProfil: resumerPourScoring(PROFIL),
  modele: 'claude-opus-5',
  score: {
    valeur: 78,
    correspondances: [{ libelle: 'Fintech', citation: 'Expérience en fintech exigée' }],
    manques: [],
    redhibitoires: [],
    citationsRejetees: 0,
  },
  ...o,
})

describe('F19 — ce qui part au modèle, et rien de plus', () => {
  it('le résumé ne porte NI nom, NI courriel, NI téléphone', () => {
    // Le scoring tourne sur chaque offre, plusieurs fois par jour, pendant des
    // mois. C'est de loin le chemin par lequel un profil part le plus souvent.
    const r = resumerPourScoring(PROFIL)
    expect(fuites(r, PROFIL)).toEqual([])
    const brut = JSON.stringify(r)
    expect(brut).not.toContain('Amina')
    expect(brut).not.toContain('example.sn')
    expect(brut).not.toContain('77 000')
  })

  it('il garde ce dont un score a BESOIN', () => {
    // Une minimisation qui casse le résultat n'est pas une minimisation, c'est
    // une régression.
    const r = resumerPourScoring(PROFIL)
    expect(r.experiences[0]!.employeur).toBe('Wave Sénégal')
    expect(r.experiences[0]!.intitule).toBe('Responsable acquisition')
    expect(r.competences).toEqual(['SQL'])
    expect(r.langues).toContain('anglais')
    expect(r.titre).toBe('Cheffe de projet marketing')
  })

  it('l’ANNÉE, jamais la date', () => {
    // « 2021-03-14 » n'aide pas à juger une correspondance que « 2021 » ne dise
    // déjà, et une date au jour près recoupée avec un employeur suffit souvent
    // à retrouver quelqu'un.
    expect(resumerPourScoring(PROFIL).experiences[0]!.anneeDebut).toBe(2021)
    expect(JSON.stringify(resumerPourScoring(PROFIL))).not.toContain('03-14')
  })

  it('l’année de diplôme est retirée — elle donne l’âge', () => {
    expect(JSON.stringify(resumerPourScoring(PROFIL))).not.toContain('2019')
  })

  it('la ville, jamais la rue', () => {
    expect(villeSeule('12 rue des Lilas, Dakar, Sénégal')).toBe('Dakar, Sénégal')
    expect(villeSeule('221 Baker Street, London')).toBe('London')
    expect(villeSeule('Dakar')).toBe('Dakar')
    expect(villeSeule(null)).toBeNull()
  })

  it('la détection de fuite regarde le TEXTE, pas la structure', () => {
    // Une adresse électronique recopiée dans une description partirait quand
    // même, et la forme de l'objet ne dirait rien.
    const bavard: ProfilComplet = {
      ...PROFIL,
      experiences: [{ ...PROFIL.experiences[0]!, description: 'Me joindre : amina.diallo@example.sn' }],
    }
    expect(fuites(resumerPourScoring(bavard), bavard)).toContain('email')
  })

  it('un numéro écrit autrement est quand même reconnu', () => {
    const bavard: ProfilComplet = {
      ...PROFIL,
      experiences: [{ ...PROFIL.experiences[0]!, description: 'Tel 221.77.000.00.00' }],
    }
    expect(fuites(resumerPourScoring(bavard), bavard)).toContain('telephone')
  })
})

describe('rejouer — deux moitiés, traitées différemment', () => {
  it('une explication intacte est dite intacte', () => {
    const r = rejouer(instantane())
    expect(r.intacte).toBe(true)
    expect(r.preuvesQuiTiennent).toBe(1)
    expect(r.divergences).toEqual([])
  })

  it('un rédhibitoire APPARU est signalé — les règles ont changé', () => {
    // La chose la plus utile que ce rejeu puisse trouver : le code a évolué
    // depuis, et cette offre ne serait plus proposée de la même façon.
    const i = instantane({ criteres: criteres({ autorisationTravail: ['SN'] }) })
    const r = rejouer(i)
    expect(r.intacte).toBe(false)
    expect(r.divergences[0]!.type).toBe('redhibitoire-apparu')
    expect(r.divergences[0]!.explication).toMatch(/ne serait plus proposée/)
  })

  it('un rédhibitoire DISPARU est le cas à regarder en premier', () => {
    // Un rédhibitoire qui disparaît est une candidature qui pourrait désormais
    // partir seule là où elle était bloquée.
    const i = instantane({
      score: { ...instantane().score, redhibitoires: [{ code: 'hors-zone', explication: 'x' }] },
    })
    const r = rejouer(i)
    expect(r.divergences.some((d) => d.type === 'redhibitoire-disparu')).toBe(true)
    expect(r.divergences.find((d) => d.type === 'redhibitoire-disparu')!.explication)
      .toMatch(/partir seule/)
  })

  it('une citation qui ne tient plus est signalée pour ce qu’elle est', () => {
    // Le texte conservé ne bouge pas : une citation introuvable veut dire que
    // la vérification a laissé passer quelque chose à l'évaluation.
    const i = instantane({
      score: {
        ...instantane().score,
        correspondances: [{ libelle: 'Inventé', citation: 'management de 12 personnes' }],
      },
    })
    const r = rejouer(i)
    expect(r.intacte).toBe(false)
    expect(r.preuvesQuiTiennent).toBe(0)
    expect(r.divergences[0]!.explication).toMatch(/a laissé passer/)
  })

  it('le rejeu lit le texte CONSERVÉ, pas l’annonce d’aujourd’hui', () => {
    // Une annonce éditée depuis ne doit pas fausser le rejeu : ce qu'on
    // vérifie est ce qui a été décidé, à partir de ce qui avait été lu.
    const i = instantane({ texteOffre: 'Un texte entièrement différent.' })
    expect(rejouer(i).preuvesQuiTiennent).toBe(0)
  })
})

describe('expliquerRejeu — ne jamais confondre les deux moitiés', () => {
  it('dit que le score n’est PAS recalculé, et pourquoi', () => {
    // Présenter le score conservé comme s'il venait d'être recalculé
    // laisserait croire à une garantie qu'on n'a pas.
    const i = instantane()
    const m = expliquerRejeu(i, rejouer(i))
    expect(m).toMatch(/je ne le recalcule pas/)
    expect(m).toMatch(/ne répond pas deux fois pareil/)
    expect(m).toContain('78')
  })

  it('dit ce qui a changé quand quelque chose a changé', () => {
    const i = instantane({ criteres: criteres({ autorisationTravail: ['SN'] }) })
    const m = expliquerRejeu(i, rejouer(i))
    expect(m).toMatch(/quelque chose a changé/)
  })

  it('cite la date de l’évaluation — c’est la question posée', () => {
    // « Pourquoi m'avez-vous proposé celle-là ? » se répond par « voici ce que
    // j'ai dit CE JOUR-LÀ », pas par « voici ce que je dirais aujourd'hui ».
    expect(expliquerRejeu(instantane(), rejouer(instantane()))).toContain('2026-08-26')
  })
})
