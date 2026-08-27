import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * JOB-002 — la clause de portée, vérifiée sur le CODE.
 *
 * La pointe a été réduite à « mesurer sans envoyer ». Une clause de portée qui
 * ne vit que dans un commentaire est une clause qu'on enfreint le jour où l'on
 * ajoute une ligne sans relire l'en-tête. Ces tests la portent.
 */

const ICI = import.meta.dirname
const sources = readdirSync(ICI).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

describe('le harnais ne peut PAS soumettre', () => {
  it('il existe des sources à vérifier', () => {
    // Un test qui passe parce qu'il n'a rien lu ne prouve rien.
    expect(sources.length).toBeGreaterThan(0)
  })

  it.each(sources)('%s n’appelle aucune méthode de soumission', (fichier) => {
    // Vingt vraies candidatures fictives feraient perdre leur temps à vingt
    // recruteurs. La pointe répond à sa question sans ça.
    const code = readFileSync(join(ICI, fichier), 'utf8')
    // On retire les commentaires : ils PARLENT de `click()` pour expliquer
    // qu'on ne l'appelle pas, et un test qui accuserait l'explication
    // pousserait à retirer l'explication.
    const sansCommentaires = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const interdit of ['.click(', '.dispatchEvent(', 'requestSubmit(', '.submit()']) {
      expect(sansCommentaires, `${fichier} contient ${interdit}`).not.toContain(interdit)
    }
  })

  it.each(sources)('%s ne remplit aucun champ', (fichier) => {
    // Remplir puis ne pas envoyer serait déjà trop : un formulaire ATS
    // enregistre souvent une candidature « brouillon » dès la première saisie,
    // et le recruteur la voit.
    const code = readFileSync(join(ICI, fichier), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const interdit of ['.fill(', '.type(', '.setInputFiles(', '.selectOption(']) {
      expect(code, `${fichier} contient ${interdit}`).not.toContain(interdit)
    }
  })

  it('aucun contournement d’anti-robot n’est tenté', () => {
    // Un produit qui apprend à franchir ces dispositifs se ferme lui-même les
    // portes qu'il veut ouvrir tous les jours.
    for (const f of sources) {
      const code = readFileSync(join(ICI, f), 'utf8').toLowerCase()
      for (const interdit of ['2captcha', 'anticaptcha', 'capsolver', 'solve_recaptcha', 'bypass']) {
        expect(code, `${f} mentionne ${interdit}`).not.toContain(interdit)
      }
    }
  })
})
