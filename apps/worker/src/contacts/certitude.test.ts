import { describe, expect, it } from 'vitest'
import {
  annoncer, CERTITUDE_MAX, evaluer, utilisablesCommeDestination,
  type Contact, type SourceContact,
} from './certitude.ts'

const signal = (source: SourceContact, o: Partial<Contact> = {}): Contact =>
  evaluer({ adresse: 'a@exemple.fr', source, justification: 'la page carrières', ...o })

describe('F26 — le texte d’une annonce n’est PAS une source', () => {
  it('l’énumération des sources est fermée et n’en contient aucune du contenu récupéré', () => {
    // Si l'identification lisait une adresse dans le corps de l'annonce, les
    // trois couches de destination.ts tomberaient d'un coup : elles vérifient
    // que l'adresse vient des « sources du serveur », et le serveur la
    // tiendrait de l'attaquant.
    const sources = Object.keys(CERTITUDE_MAX)
    expect(sources.sort()).toEqual(
      ['fourni-par-vous', 'motif-de-domaine', 'page-carrieres', 'registre-public'].sort(),
    )
    for (const s of sources)
      expect(s).not.toMatch(/offre|annonce|description|texte|contenu/i)
  })
})

describe('la certitude vient de la SOURCE, pas de l’envie', () => {
  it('une page carrières de l’employeur confirme', () => {
    expect(signal('page-carrieres').certitude).toBe('confirme')
  })

  it('ce que la personne nous a donné confirme — la source la plus fiable', () => {
    expect(signal('fourni-par-vous').certitude).toBe('confirme')
  })

  it('un registre public reste PROBABLE', () => {
    expect(signal('registre-public').certitude).toBe('probable')
  })

  it('un motif de nommage ne produit JAMAIS mieux qu’une devinette', () => {
    // Même quand le motif marche chez neuf employeurs sur dix : le dixième
    // reçoit un courriel à une adresse qui appartient peut-être à un tiers.
    expect(signal('motif-de-domaine').certitude).toBe('devine')
  })
})

describe('une devinette n’est jamais une destination', () => {
  const contacts: Contact[] = [
    signal('page-carrieres', { adresse: 'jobs@exemple.fr' }),
    signal('registre-public', { adresse: 'rh@exemple.fr' }),
    signal('fourni-par-vous', { adresse: 'connu@exemple.fr' }),
    signal('motif-de-domaine', { adresse: 'marie.dupont@exemple.fr' }),
  ]

  it('l’adresse devinée est écartée des destinations utilisables', () => {
    const utiles = utilisablesCommeDestination(contacts).map((c) => c.adresse)
    expect(utiles).not.toContain('marie.dupont@exemple.fr')
    expect(utiles).toHaveLength(3)
  })

  it('mais elle reste PROPOSABLE : REQ-016 la veut affichée, pas cachée', () => {
    // La cacher priverait la personne de la seule piste disponible sur bien
    // des offres. La règle est « présentée comme devinée », pas « supprimée ».
    expect(annoncer(signal('motif-de-domaine', { nom: 'Marie Dupont' }))).toContain('Marie Dupont')
  })

  it('une provenance est attribuée à chaque destination retenue', () => {
    const u = utilisablesCommeDestination(contacts)
    expect(u.find((x) => x.adresse === 'jobs@exemple.fr')?.provenance).toBe('domaine-employeur')
    expect(u.find((x) => x.adresse === 'rh@exemple.fr')?.provenance).toBe('contact-enregistre')
  })
})

describe('« devinée » se lit dans la phrase, pas dans une nuance de gris', () => {
  it('le mot est écrit, en toutes lettres', () => {
    const texte = annoncer(signal('motif-de-domaine', { nom: 'Marie Dupont' }))
    expect(texte).toContain('DEVINÉE')
    expect(texte).toMatch(/aucune preuve qu’elle existe/)
  })

  it('une adresse probable dit ce qui manque', () => {
    expect(annoncer(signal('registre-public', { nom: 'Jean Roux' })))
      .toMatch(/pas de confirmation que c’est la bonne personne/)
  })

  it('une adresse confirmée n’ajoute pas de réserve inutile', () => {
    const texte = annoncer(signal('page-carrieres', { nom: 'Service RH' }))
    expect(texte).not.toMatch(/devinée|pas de confirmation|vérifiez/i)
  })
})
