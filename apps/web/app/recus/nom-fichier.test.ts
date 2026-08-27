import { describe, expect, it } from 'vitest'
import { nomFichierLot, nomFichierRecu } from './nom-fichier'

/**
 * `Content-Disposition` accepte une chaîne entre guillemets. Un guillemet, un
 * point-virgule ou un retour à la ligne y injecte un autre paramètre — voire
 * un autre en-tête. Le nom de fichier ne doit donc tirer AUCUN caractère du
 * contenu, et ces tests le vérifient sur les entrées les plus hostiles
 * plausibles.
 */
describe('nomFichierRecu', () => {
  const ID = '3f2b1a7c-9d4e-4a5b-8c6d-0e1f2a3b4c5d'

  it('compose un nom à partir de la date et de l’identifiant', () => {
    expect(nomFichierRecu(ID, '2026-08-27T10:00:00.000Z', 'txt')).toBe('recu-2026-08-27-3f2b1a7c.txt')
  })

  it('ne laisse passer aucun caractère hostile venu d’un identifiant forgé', () => {
    for (const forge of [
      'x"; filename="pirate.exe',
      'a\nSet-Cookie: session=vole',
      '../../etc/passwd',
      '',
    ]) {
      const nom = nomFichierRecu(forge, '2026-08-27T10:00:00Z', 'txt')
      expect(nom, forge).toBe('recu-2026-08-27-recu.txt')
      expect(nom).toMatch(/^[a-z0-9.-]+$/)
    }
  })

  it('supporte une date absente sans produire un nom bancal', () => {
    expect(nomFichierRecu(ID, 'pas une date', 'txt')).toBe('recu-sans-date-3f2b1a7c.txt')
  })

  it('le nom du lot ne dépend que de l’horloge', () => {
    expect(nomFichierLot(new Date('2026-08-27T23:59:00Z'))).toBe('recus-2026-08-27.json')
  })
})
