import { describe, expect, it, vi } from 'vitest'
import { choisirLangue, detecterLangue, maitrise } from './langue.ts'
import { engendrerLettre, organisationsCitees, verifierLettre } from './lettre.ts'
import type { Completer } from './cv.ts'
import type { ProfilCanonique } from './profil-canonique.ts'

const PROFIL: ProfilCanonique = {
  nomComplet: 'Amina Diallo',
  titreAccroche: 'Cheffe de projet marketing',
  email: null, telephone: null, localisation: 'Dakar',
  experiences: [{
    id: 'exp-1', employeur: 'Wave Sénégal', intitule: 'Responsable acquisition',
    debut: '2021-01-01', fin: null,
    description: 'Pilotage de trois agences.',
  }],
  formations: [{ id: 'for-1', etablissement: 'ISM Dakar', intitule: 'Master Marketing', obtenueEn: 2019 }],
  competences: ['SQL'],
  langues: ['français (langue maternelle)', 'anglais (courant)', 'wolof'],
}

const FR = 'Nous recherchons pour notre entreprise un chef de projet avec vous chez nous dans notre équipe pour ce poste.'
const EN = 'We are looking for a product manager to join our team. You will own the roadmap and work with our engineers about the role.'
const NL = 'Wij zoeken voor ons bedrijf een functie met jij en jouw team bij ons voor deze functie met voor.'

describe('detecterLangue', () => {
  it('reconnaît le français et l’anglais', () => {
    expect(detecterLangue(FR).langue).toBe('fr')
    expect(detecterLangue(EN).langue).toBe('en')
  })

  it('rend « inconnue » plutôt qu’un pari', () => {
    // Se tromper de langue ne produit pas un texte médiocre : il produit une
    // lettre en espagnol pour une offre italienne — pire qu'une lettre en
    // anglais. « Je ne sais pas » renvoie un choix d'un geste ; deviner
    // renvoie un document à jeter.
    expect(detecterLangue('Dev').langue).toBe('inconnue')
    expect(detecterLangue('Kubernetes Terraform Kafka Redis Docker AWS GCP Azure Linux Bash Go Rust').langue)
      .toBe('inconnue')
  })
})

describe('maitrise — indulgente sur la forme', () => {
  it('reconnaît « anglais (courant) » comme de l’anglais', () => {
    // Exiger un code ISO écarterait la quasi-totalité des profils réels et
    // déclencherait l'alerte pour tout le monde — une alerte qui se déclenche
    // toujours n'alerte plus.
    expect(maitrise('en', PROFIL.langues)).toBe(true)
    expect(maitrise('fr', PROFIL.langues)).toBe(true)
    expect(maitrise('nl', PROFIL.langues)).toBe(false)
  })
})

describe('choisirLangue — le piège posé avec soin', () => {
  it('écrit quand la langue est détectée ET maîtrisée', () => {
    expect(choisirLangue(EN, PROFIL.langues)).toEqual({ ecrire: true, langue: 'en' })
  })

  it('REFUSE d’écrire dans une langue absente du profil', () => {
    // Un modèle écrit un néerlandais irréprochable en trois secondes ; le
    // candidat qui l'envoie sera rappelé en néerlandais. Écrire dans une
    // langue qu'on ne parle pas n'est pas un service rendu.
    const v = choisirLangue(NL, PROFIL.langues)
    expect(v.ecrire).toBe(false)
    expect(v.ecrire === false && v.motif).toBe('langue-non-maitrisee')
    expect(v.ecrire === false && v.explication).toMatch(/rappelé/)
  })

  it('ne se rabat JAMAIS sur l’anglais en silence', () => {
    // Écrire en anglais pour une annonce néerlandaise dit quelque chose de la
    // personne au recruteur. Ce n'est pas à nous de le dire à sa place.
    const v = choisirLangue(NL, PROFIL.langues)
    expect(v.ecrire === false && v.langue).toBe('nl')
  })

  it('refuse aussi quand la langue est indéterminable', () => {
    const v = choisirLangue('Dev', PROFIL.langues)
    expect(v.ecrire === false && v.motif).toBe('langue-inconnue')
  })
})

describe('verifierLettre', () => {
  it('accepte une lettre qui ne dit que ce que le profil contient', () => {
    expect(verifierLettre(
      'Chez Wave Sénégal, je pilote trois agences depuis 2021. Mon Master Marketing à ISM Dakar m’a formée.',
      PROFIL,
    )).toEqual([])
  })

  it('refuse un CHIFFRE absent du profil', () => {
    expect(verifierLettre('J’ai fait croître l’équipe de 40 % en un an.', PROFIL))
      .toContainEqual({ type: 'chiffre-invente', chiffre: '40' })
  })

  it('refuse un EMPLOYEUR que le profil ne nomme pas', () => {
    // « Mon passage chez Google » est un mensonge qui tiendra quinze secondes
    // en entretien.
    expect(verifierLettre('Mon passage chez Google m’a appris la rigueur.', PROFIL))
      .toContainEqual({ type: 'employeur-invente', nom: 'Google' })
  })

  it('ne cherche que la CONSTRUCTION de rattachement, pas les majuscules', () => {
    // Deux essais contre le vrai modèle ont démoli l'heuristique « mot
    // capitalisé absent du profil » : elle accusait « Growth », « Lead »,
    // « English », « Manager », « January », « Masters ». L'anglais capitalise
    // les titres, les mois et les diplômes.
    expect(organisationsCitees('Growth Marketing Lead — I am a Manager since January.')).toEqual([])
    expect(organisationsCitees('My time at Google taught me.')).toEqual(['Google'])
    expect(organisationsCitees('Mon passage chez Wave Sénégal.')).toEqual(['Wave Sénégal'])
  })

  it('ne franchit pas une fin de phrase', () => {
    // Un essai réel a rendu « Northwind. I » : l'employeur visé, parfaitement
    // légitime, refusé à cause du pronom qui ouvrait la phrase suivante.
    expect(organisationsCitees('I worked at Northwind. I would bring rigour.')).toEqual(['Northwind'])
    expect(organisationsCitees('Travailler chez Wave. Amina apporte de la rigueur.')).toEqual(['Wave'])

    // Et rien à signaler quand il n'y a aucune construction de rattachement :
    // « Joining Northwind » n'affirme pas un passé, il exprime un souhait.
    expect(organisationsCitees('Joining Northwind would extend that.')).toEqual([])
  })

  it('une organisation du profil citée partiellement reste légitime', () => {
    // Le profil dit « Wave Sénégal », la lettre peut dire « Wave ».
    expect(verifierLettre('Mon travail chez Wave depuis 2021.', PROFIL)).toEqual([])
  })

  it('ne se déclenche pas sur une lettre honnête en anglais', () => {
    expect(verifierLettre(
      'I am a Growth Marketing Manager. At Wave Sénégal I led agencies since 2021. My Masters at ISM Dakar helped.',
      PROFIL, ['Growth Marketing Manager'],
    )).toEqual([])
  })
})

describe('engendrerLettre', () => {
  const repond = (texte: string): Completer => vi.fn(async () => ({ texte, refus: false }))

  it('n’appelle PAS le modèle quand la langue n’est pas maîtrisée', async () => {
    // Inutile de dépenser un appel pour un document qu'on s'apprête à refuser.
    const completer = repond('x')
    const r = await engendrerLettre(PROFIL, { texte: NL, employeur: 'Bol' }, completer, { imputableA: 'c1' })
    expect(completer).not.toHaveBeenCalled()
    expect(r.ok === false && r.motif).toBe('langue')
  })

  it('le choix explicite de la personne l’emporte sur l’alerte', async () => {
    // C'est elle qui sait ce qu'elle peut défendre.
    const completer = repond('Ik werk bij Wave Sénégal sinds 2021.')
    const r = await engendrerLettre(PROFIL, { texte: NL, employeur: 'Bol' }, completer, {
      imputableA: 'c1', langueImposee: 'nl',
    })
    expect(completer).toHaveBeenCalled()
    expect(r.ok).toBe(true)
  })

  it('l’employeur VISÉ est légitime dans la lettre — elle lui est adressée', async () => {
    const r = await engendrerLettre(
      PROFIL,
      { texte: EN, employeur: 'Northwind' },
      repond('Working at Wave Sénégal since 2021 taught me. Joining Northwind would extend that.'),
      { imputableA: 'c1' },
    )
    expect(r.ok).toBe(true)
  })

  it('refuse une lettre qui invente, et le DIT sans la donner', async () => {
    const r = await engendrerLettre(
      PROFIL,
      { texte: EN, employeur: 'Northwind' },
      repond('At Wave Sénégal I grew the team by 40 percent.'),
      { imputableA: 'c1' },
    )
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.motif).toBe('contrainte')
    expect(r.ok === false && r.explication).toMatch(/justifier/)
  })

  it('le journal note le TYPE, jamais le texte de la lettre', async () => {
    const journal = { log: vi.fn() }
    await engendrerLettre(
      PROFIL, { texte: EN, employeur: 'Northwind' },
      repond('At Wave Sénégal I grew the team by 40 percent.'),
      { imputableA: 'c1', journal },
    )
    const brut = JSON.stringify(journal.log.mock.calls)
    expect(brut).toContain('chiffre-invente')
    expect(brut).not.toContain('grew the team')
  })
})
