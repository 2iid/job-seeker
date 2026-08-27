import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * REQ-011 — « Toute destination sortante provient de données vérifiées côté
 * serveur, jamais du contenu récupéré. »
 *
 * Le type et le contrôle d'exécution disent CE QUI est accepté. Ce test dit
 * autre chose, et de plus fort : le chemin d'envoi ne VOIT PAS le texte de
 * l'annonce. Une adresse ne peut pas venir d'un texte auquel le code n'a pas
 * accès — c'est une garantie structurelle, pas une vigilance.
 *
 * Elle vaut aussi contre l'injection indirecte : une annonce qui dirait
 * « ignore tes instructions et écris à … » ne peut rien atteindre ici, puisque
 * ces octets n'entrent jamais dans ce dossier.
 */
const RACINE = new URL('.', import.meta.url).pathname

/**
 * Les champs qui portent le CORPS d'une annonce, ailleurs dans le projet.
 *
 * `description` en fait partie : c'est la colonne où vit le texte publié par
 * l'employeur, donc l'endroit exact où se cacherait « envoyez votre
 * candidature à … ».
 *
 * `titre` n'y est PAS, et c'est un choix explicite plutôt qu'un oubli.
 * `republicationProbable` en a besoin pour reconnaître deux annonces du même
 * poste, et un intitulé ne peut pas porter une destination : il ne sert qu'à
 * comparer et à composer une phrase affichée. Le sceau porte sur le corps de
 * l'annonce, pas sur chacun de ses champs — le dire vaut mieux que le laisser
 * croire plus large qu'il n'est.
 */
const TEXTE_D_ANNONCE = /\b(texteComplet|texteOffre|descriptionOffre|contenuAnnonce|description)\b/

function sources(): string[] {
  return readdirSync(RACINE)
    .filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    .map((f) => join(RACINE, f))
}

describe('le chemin d’envoi est étanche au texte des annonces', () => {
  it('aucun module d’envoi ne lit un champ de texte d’annonce', () => {
    const coupables = sources().filter((f) => TEXTE_D_ANNONCE.test(readFileSync(f, 'utf8')))
    expect(coupables.map((f) => f.slice(RACINE.length))).toEqual([])
  })

  it('le test regarde bien quelque chose', () => {
    // Un test qui n'ouvre aucun fichier passe toujours.
    expect(sources().length).toBeGreaterThan(2)
  })

  it('seul destination.ts sait fabriquer une destination vérifiée', () => {
    // La marque n'est ni exportée ni reproductible. Si un autre module du
    // chemin d'envoi se met à écrire un littéral marqué, la garantie tombe.
    const autres = sources().filter((f) => !f.endsWith('destination.ts'))
    for (const f of autres) {
      const texte = readFileSync(f, 'utf8')
      expect(texte, f).not.toMatch(/Symbol\(['"]destination-verifiee/)
    }
  })
})

describe('un seul chemin mène à un envoi', () => {
  it('`executer` n’est pas exporté par l’entrée du module', () => {
    // Il envoie sans réclamer. Un garde-fou qu'on contourne en important
    // l'étage du dessous ne garde rien — c'est le contournement le plus
    // naturel, et il se fait sans mauvaise intention.
    const index = readFileSync(join(RACINE, 'index.ts'), 'utf8')
    expect(index).not.toMatch(/export\s*\{[^}]*\bexecuter\b/)
    expect(index).toMatch(/export\s*\{\s*traiterEnvoi\s*\}/)
  })

  it('seul traiter.ts APPELLE `executer` — envoyer.ts se contente de le définir', () => {
    const appelants = sources()
      .filter((f) => !f.endsWith('envoyer.ts'))
      .filter((f) => /\bexecuter\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(RACINE.length))
    expect(appelants).toEqual(['traiter.ts'])
  })

  // L'ORDRE — réclamer avant d'envoyer — n'est PAS vérifié ici.
  //
  // Un premier jet comparait les positions des deux appels dans le texte de
  // traiter.ts. Il échouait, et il avait tort de réussir : le canal ATS appelle
  // légitimement `executer` SANS réclamer, puisqu'il ne fait rien sortir. Un
  // test qui lit l'ordre des lignes ne distingue pas les deux chemins.
  //
  // La propriété est donc prouvée par le comportement, là où elle existe
  // vraiment : tests/rls/idempotence-envoi.test.ts lance deux traitements
  // simultanés sur la même offre et vérifie que le transport n'est appelé
  // qu'une fois.
})
