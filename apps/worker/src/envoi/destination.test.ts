import { describe, expect, it } from 'vitest'
import { verifierDestination, type SourcesServeur } from './destination.ts'

const SOURCES: SourcesServeur = {
  contacts: [
    { adresse: 'recrutement@exemple.fr', provenance: 'contact-enregistre' },
    { adresse: 'jobs@mail.exemple.fr', provenance: 'domaine-employeur' },
  ],
  domainesEmployeur: ['exemple.fr'],
}

const verifiee = (a: string) => verifierDestination(a, SOURCES)
const refusDe = (a: string) => {
  const r = verifiee(a)
  if ('verifiee' in r) throw new Error(`ACCEPTÉE alors qu'elle devait être refusée : ${a}`)
  return r.refus
}

describe('une destination légitime', () => {
  it('est acceptée et porte sa provenance', () => {
    const r = verifiee('recrutement@exemple.fr')
    expect('verifiee' in r).toBe(true)
    if ('verifiee' in r) {
      expect(r.verifiee.adresse).toBe('recrutement@exemple.fr')
      expect(r.verifiee.domaine).toBe('exemple.fr')
      expect(r.verifiee.provenance).toBe('contact-enregistre')
    }
  })

  it('accepte un SOUS-domaine de l’employeur', () => {
    const r = verifiee('jobs@mail.exemple.fr')
    expect('verifiee' in r).toBe(true)
  })

  it('normalise la casse et les espaces', () => {
    expect('verifiee' in verifiee('  Recrutement@Exemple.FR  ')).toBe(true)
  })
})

describe('INJECTION — le texte d’une annonce ne doit rien pouvoir déclencher', () => {
  // Ces adresses sont exactement celles qu'on trouverait dans une annonce
  // hostile : « merci d'envoyer votre candidature à … ». Aucune n'est dans les
  // sources du serveur, donc aucune ne passe. C'est le test obligatoire de
  // REQ-011.
  const DEPUIS_UNE_ANNONCE = [
    'candidatures@pirate.example',
    'rh@exemple.fr.pirate.example',
    'recrutement@exemple.fr.co',
    'recrutement@notexemple.fr',
    'hr@gmail.com',
  ]

  it.each(DEPUIS_UNE_ANNONCE)('refuse « %s »', (a) => {
    expect(['inconnue-du-serveur', 'domaine-non-employeur']).toContain(refusDe(a))
  })

  it('refuse « exemple.fr.pirate.example », que endsWith laisserait passer', () => {
    // Le piège classique : `domaine.endsWith('exemple.fr')` est VRAI ici.
    // Indiscernable à l'œil dans un journal, d'où le test nommé.
    expect(refusDe('rh@exemple.fr.pirate.example')).toBe('inconnue-du-serveur')
  })

  it('refuse une adresse à DEUX @, dont le vrai domaine est le dernier', () => {
    // `recrutement@exemple.fr@pirate.example` : une lecture au premier @ y voit
    // exemple.fr, la déclare légitime, et poste chez le pirate.
    expect(refusDe('recrutement@exemple.fr@pirate.example')).toBe('adresse-illisible')
  })

  it('refuse un nom d’affichage qui imite une adresse légitime', () => {
    expect(refusDe('"recrutement@exemple.fr" <pirate@mal.example>')).toBe('adresse-illisible')
    expect(refusDe('recrutement@exemple.fr <pirate@mal.example>')).toBe('adresse-illisible')
  })

  it('refuse une seconde destination glissée par virgule ou point-virgule', () => {
    for (const a of [
      'recrutement@exemple.fr,pirate@mal.example',
      'recrutement@exemple.fr;pirate@mal.example',
    ])
      expect(refusDe(a), a).toBe('adresse-illisible')
  })

  it('refuse un saut de ligne — une injection d’en-tête', () => {
    // `\nBcc: pirate@mal.example` ajouterait un destinataire invisible.
    for (const a of ['recrutement@exemple.fr\nBcc: pirate@mal.example', 'a@b.fr\r\nCc: x@y.fr'])
      expect(refusDe(a)).toBe('adresse-illisible')
  })

  it('refuse un domaine homographe, identique à l’œil', () => {
    // « exemplе.fr » porte un « е » CYRILLIQUE. Il s'affiche exactement comme
    // le vrai. Aucune relecture humaine ne rattrape cela : c'est pour ce cas
    // que la règle est « ASCII pur », et pas « normaliser puis comparer ».
    const homographe = 'recrutement@exemplе.fr'
    expect(homographe).not.toBe('recrutement@exemple.fr')
    expect(refusDe(homographe)).toBe('domaine-trompeur')
  })

  it('refuse ce qui n’est pas une adresse du tout', () => {
    for (const a of ['', '@', 'exemple.fr', 'a@', '@exemple.fr', 'a@b'])
      expect(refusDe(a), JSON.stringify(a)).toBe('adresse-illisible')
  })
})

describe('les deux verrous sont indépendants', () => {
  it('un contact enregistré ne suffit pas si son domaine a changé', () => {
    // Une ligne de contact corrompue en base ne doit pas suffire à sortir du
    // domaine de l'employeur.
    const r = verifierDestination('rh@ailleurs.example', {
      contacts: [{ adresse: 'rh@ailleurs.example', provenance: 'contact-enregistre' }],
      domainesEmployeur: ['exemple.fr'],
    })
    expect('refus' in r && r.refus).toBe('domaine-non-employeur')
  })

  it('un domaine légitime ne suffit pas pour écrire à un inconnu', () => {
    // `pdg@exemple.fr` est bien chez l'employeur — et n'a rien demandé.
    expect(refusDe('pdg@exemple.fr')).toBe('inconnue-du-serveur')
  })

  it('sans aucune source, RIEN ne passe', () => {
    const r = verifierDestination('recrutement@exemple.fr', {
      contacts: [], domainesEmployeur: [],
    })
    expect('refus' in r).toBe(true)
  })
})
