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

/** Les champs qui portent le texte d'une annonce, ailleurs dans le projet. */
const TEXTE_D_ANNONCE = /\b(texteComplet|texteOffre|descriptionOffre|contenuAnnonce)\b/

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
