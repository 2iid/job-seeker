import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * F10 — la route de connexion ne doit jamais apprendre à personne qui est
 * inscrit. Sur ce produit, cette fuite trahit quelqu'un auprès de son
 * employeur ; elle vaut plus qu'une note dans un rapport.
 *
 * Le smoke le vérifie de l'extérieur, en comparant deux réponses réelles.
 * Ce test-ci garde le CÔTÉ SOURCE, pour la seule raison qui vaille : la
 * prochaine personne qui lira cette route va vouloir l'améliorer. Ne pas
 * remonter l'erreur de `signInWithOtp` ressemble à un oubli, et « améliorer le
 * message d'erreur pour être plus utile » est exactement la régression que F10
 * annonce. Un test qui échoue en nommant la raison vaut mieux qu'un
 * commentaire qu'on peut supprimer en même temps que le code.
 */
const ROUTE = new URL('../../apps/web/app/auth/lien/route.ts', import.meta.url).pathname
const source = readFileSync(ROUTE, 'utf8')

describe('/auth/lien ne dit jamais qui est inscrit', () => {
  it('ne récupère pas le résultat de signInWithOtp', () => {
    // `const { error } = await supabase.auth.signInWithOtp(...)` : la seule
    // façon d'en faire quelque chose est d'abord de le lire.
    const appel = source.slice(source.indexOf('signInWithOtp'))
    expect(source).not.toMatch(/(?:const|let)\s*\{[^}]*\}\s*=\s*await\s+supabase\.auth\.signInWithOtp/)
    expect(appel.length).toBeGreaterThan(0)
  })

  it('n’a qu’une seule destination de succès', () => {
    // Deux destinations, c'est déjà deux réponses distinguables.
    const occurrences = source.match(/versEnvoye/g) ?? []
    expect(occurrences.length).toBe(2) // la déclaration, et l'unique usage
  })

  it('consomme le jeton d’adresse AVANT tout appel au fournisseur', () => {
    // Si la limitation venait après, le compteur ne s'incrémenterait que pour
    // les chemins atteints — et le simple fait d'être limité, ou non,
    // deviendrait l'information.
    expect(source.indexOf('verifierLimite')).toBeLessThan(source.indexOf('signInWithOtp'))
  })

  it('ne renvoie jamais la portée qui a refusé vers le navigateur', () => {
    const apresVerdict = source.slice(source.indexOf('verdict.autorise'))
    expect(apresVerdict).not.toContain('verdict.portee')
  })
})
