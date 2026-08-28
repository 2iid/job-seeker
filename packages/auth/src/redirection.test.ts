import { describe, expect, it } from 'vitest'
import { DESTINATIONS_AUTORISEES, DESTINATION_PAR_DEFAUT, destinationSure } from './redirection'

// Construits par code : un caractere de controle ecrit litteralement dans un
// fichier source est invisible a la relecture, donc indebogable.
const NUL = String.fromCharCode(0)
const CR = String.fromCharCode(13)
const TAB = String.fromCharCode(9)

describe('destinationSure - la liste, jamais un motif', () => {
  it('laisse passer une destination declaree', () => {
    expect(destinationSure('/suivi')).toBe('/suivi')
    expect(destinationSure('/opportunites?score=90')).toBe('/opportunites')
    expect(destinationSure('/profil/')).toBe('/profil')
  })

  it.each([
    ['https://evil.example/piege', 'URL absolue vers un autre hote'],
    ['//evil.example', 'relatif au protocole, le navigateur le suit'],
    ['/\\evil.example', 'barre inversee, normalisee par certains parseurs'],
    ['\\\\evil.example', 'double barre inversee'],
    ['javascript:alert(1)', 'schema javascript'],
    ['data:text/html,<script>', 'schema data'],
    ['%2f%2fevil.example', 'encode : passe sous un visage, suivi sous un autre'],
    [`/suivi${NUL}/../../evil`, 'octet nul'],
    [`/suivi${CR}evil`, 'retour chariot qui tronque l analyse'],
    [`/suivi${TAB}evil`, 'tabulation'],
    ['/administration', 'chemin interne mais NON declare'],
    ['/opportunites/../agent', 'traversee vers un autre chemin declare'],
    ['', 'vide'],
  ])('refuse une destination douteuse (%#) : %s', (entree) => {
    expect(destinationSure(entree)).toBe(DESTINATION_PAR_DEFAUT)
  })

  it('ne leve jamais, meme sur un encodage invalide', () => {
    expect(() => destinationSure('%E0%A4%A')).not.toThrow()
    expect(destinationSure('%E0%A4%A')).toBe(DESTINATION_PAR_DEFAUT)
    expect(destinationSure(null)).toBe(DESTINATION_PAR_DEFAUT)
    expect(destinationSure(undefined)).toBe(DESTINATION_PAR_DEFAUT)
  })

  it('un chemin declare ne peut pas servir de prefixe a un autre', () => {
    // /suivi-evil commence par /suivi : un test de prefixe l aurait laisse
    // passer. La correspondance est exacte.
    expect(destinationSure('/suivi-evil')).toBe(DESTINATION_PAR_DEFAUT)
    expect(destinationSure('/profilx')).toBe(DESTINATION_PAR_DEFAUT)
  })
})

describe('la destination par défaut mène quelque part', () => {
  it('correspond à une page qui EXISTE dans l’application', async () => {
    // Le défaut était `/accueil`, un écran jamais construit : toute connexion
    // finissait sur un 404. La liste d'autorisation avait pourtant l'air
    // correcte — elle contient bien `/accueil`. Une liste de chemins AUTORISÉS
    // ne dit rien de leur EXISTENCE, et rien ne reliait les deux.
    const { existsSync } = await import('node:fs')
    const app = new URL('../../../apps/web/app/', import.meta.url).pathname
    const segment = DESTINATION_PAR_DEFAUT === '/' ? '' : DESTINATION_PAR_DEFAUT.slice(1)
    const page = segment === '' ? `${app}page.tsx` : `${app}${segment}/page.tsx`
    expect(existsSync(page), `${DESTINATION_PAR_DEFAUT} n’a pas de page`).toBe(true)
  })

  it('est elle-même autorisée — sinon elle serait remplacée par elle-même', () => {
    expect(DESTINATIONS_AUTORISEES).toContain(DESTINATION_PAR_DEFAUT)
  })
})
