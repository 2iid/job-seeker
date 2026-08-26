import { describe, expect, it } from 'vitest'
import { fr } from './fr.ts'
import { en } from './en.ts'
import { creerTraducteur, localeDepuisEnTete, remplir, traduire, LOCALES } from './traduire.ts'
import type { Cle } from './cles.ts'

const CLES = Object.keys(fr) as Cle[]
const trous = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()

describe('les deux langues sont conçues ensemble', () => {
  it('aucune clé française n’est orpheline en anglais', () => {
    // Le typage l'impose déjà à la compilation. Ce test garde le cas que le
    // typage ne voit pas : une clé ajoutée par une fusion mal résolue.
    expect(CLES.filter((c) => en[c] === undefined)).toEqual([])
  })

  it('et réciproquement — aucune chaîne anglaise sans clé française', () => {
    expect(Object.keys(en).filter((c) => !(c in fr))).toEqual([])
  })

  it('les substitutions sont les MÊMES des deux côtés', () => {
    // Une traduction qui perd son `{n}` affiche « il y a min » à quelqu'un.
    // Aucune relecture de code ne voit ça ; un test, si.
    for (const c of CLES) {
      expect(trous(en[c]), `${c} : les accolades diffèrent entre fr et en`).toEqual(trous(fr[c]))
    }
  })

  it('aucune chaîne vide, dans aucune langue', () => {
    for (const c of CLES) {
      expect(fr[c].trim(), `${c} en français`).not.toBe('')
      expect(en[c].trim(), `${c} en anglais`).not.toBe('')
    }
  })

  it('l’anglais n’est pas une recopie du français', () => {
    // Quelques identités sont légitimes (« Interview »). Une majorité
    // d'identités signifierait qu'on a livré un fichier non traduit.
    const identiques = CLES.filter((c) => fr[c] === en[c])
    expect(identiques.length / CLES.length).toBeLessThan(0.1)
  })
})

/**
 * G6 — la troncature à 390 px.
 *
 * Ce test mesure des CARACTÈRES, pas des pixels, et il faut le dire : la
 * vérification au pixel demande un vrai rendu, donc le harnais de bout en bout,
 * qui n'existe pas encore (`JOB-084`).
 *
 * Le budget n'est pas arbitraire pour autant. À 390 px, la grille du système
 * laisse 358 px utiles (marge 16 de chaque côté). Le corps est à 15 px dans une
 * sans-serif système, dont la largeur moyenne tourne autour de 0,52 em, soit
 * ≈ 7,8 px par caractère : environ 45 caractères par ligne. Un libellé de
 * bouton ou de pastille, lui, partage sa ligne et n'en a qu'une fraction.
 *
 * Ce qu'il attrape réellement : la traduction de quarante caractères ajoutée
 * dans un emplacement qui en tient quinze. C'est la régression fréquente, et
 * elle passe toutes les relectures parce qu'elle a l'air correcte dans un
 * fichier de chaînes.
 */
describe('G6 — ce qui doit tenir dans un petit emplacement', () => {
  const BUDGETS: { prefixe: string; max: number; emplacement: string }[] = [
    // Un libellé de statut n'est PAS une pastille : la pastille est la forme
    // (cercle, losange, triangle…), et G5 impose que le libellé l'accompagne.
    // Sous 768 px la ligne de tableau devient une ligne de liste où le statut
    // occupe la sienne — il dispose donc d'une ligne complète, pas d'un coin.
    // Le budget de 26 caractères venait d'une erreur de catégorie de ma part,
    // et « Escalade — je rends la main » l'a révélée en le dépassant d'un
    // caractère. C'est la ligne qui a bougé, pas le libellé : raccourcir un
    // libellé que le design a écrit pour être compris aurait fait passer le
    // test en dégradant précisément ce qu'il protège.
    { prefixe: 'statut.', max: 45, emplacement: 'libellé de statut, sur sa propre ligne à 390 px' },
    { prefixe: 'palier.', max: 10, emplacement: 'étiquette de palier, à côté de l’âge' },
    { prefixe: 'approbation.envoyer', max: 22, emplacement: 'bouton principal' },
    { prefixe: 'approbation.refuser', max: 22, emplacement: 'bouton secondaire' },
    { prefixe: 'approbation.modifier', max: 26, emplacement: 'bouton secondaire' },
    { prefixe: 'commun.', max: 22, emplacement: 'bouton ou lien' },
    { prefixe: 'fraicheur.', max: 18, emplacement: 'âge, affiché à côté du palier' },
    { prefixe: 'score.deplier', max: 30, emplacement: 'lien de dépliage' },
    { prefixe: 'score.replier', max: 30, emplacement: 'lien de dépliage' },
    { prefixe: 'agent.en-veille', max: 14, emplacement: 'état de l’agent, en tête' },
    { prefixe: 'agent.au-travail', max: 14, emplacement: 'état de l’agent, en tête' },
    { prefixe: 'agent.arrete', max: 14, emplacement: 'état de l’agent, en tête' },
  ]

  it.each(LOCALES)('%s : chaque libellé court tient dans son emplacement', (locale) => {
    const dico = locale === 'fr' ? fr : (en as Record<string, string>)
    for (const { prefixe, max, emplacement } of BUDGETS) {
      for (const c of CLES) {
        // Les clés « .sens » sont des phrases explicatives : elles ont leur
        // propre ligne et ne partagent aucun emplacement contraint.
        if (!c.startsWith(prefixe) || c.endsWith('.sens') || c.endsWith('.promesse') || c.endsWith('.releve')) continue
        const valeur = dico[c] ?? ''
        expect(
          valeur.length,
          `${c} (${locale}) fait ${valeur.length} caractères pour ${max} — ${emplacement}`,
        ).toBeLessThanOrEqual(max)
      }
    }
  })

  it('la chaîne la plus longue reste sous une ligne complète à 390 px', () => {
    // ≈ 45 caractères par ligne ; on tolère trois lignes pour une phrase
    // explicative, au-delà l'emplacement n'est plus un emplacement.
    for (const locale of LOCALES) {
      const dico = locale === 'fr' ? fr : (en as Record<string, string>)
      for (const c of CLES) {
        expect((dico[c] ?? '').length, `${c} (${locale}) dépasse trois lignes à 390 px`).toBeLessThanOrEqual(135)
      }
    }
  })
})

describe('traduire', () => {
  it('remplit les trous', () => {
    expect(traduire('fraicheur.minutes', 'fr', { n: 4 })).toBe('il y a 4 min')
    expect(traduire('fraicheur.minutes', 'en', { n: 4 })).toBe('4 min ago')
  })

  it('laisse un trou SANS paramètre tel quel, accolades comprises', () => {
    // L'effacer donnerait « il y a  min » : une phrase qui a l'air correcte et
    // qui a perdu son information. C'est la version la plus coûteuse de
    // l'erreur, parce qu'elle passe la relecture.
    expect(remplir('il y a {n} min')).toBe('il y a {n} min')
  })

  it('rend la CLÉ sur une clé inconnue, jamais du vide', () => {
    // Une chaîne vide disparaît dans la mise en page ; un repli sur le français
    // met un mot français dans un écran anglais. Les deux passent inaperçus.
    expect(traduire('inconnue.xyz' as Cle, 'en')).toBe('inconnue.xyz')
  })

  it('creerTraducteur lie la langue une fois pour toutes', () => {
    const t = creerTraducteur('en')
    expect(t('statut.envoyee')).toBe('Sent')
  })
})

describe('localeDepuisEnTete', () => {
  it('lit la préférence, pondération comprise', () => {
    expect(localeDepuisEnTete('en-GB,en;q=0.9,fr;q=0.8')).toBe('en')
    expect(localeDepuisEnTete('fr-SN,fr;q=0.9,en;q=0.8')).toBe('fr')
    expect(localeDepuisEnTete('de,en;q=0.7,fr;q=0.9')).toBe('fr')
  })

  it('sert le français quand la demande est absente ou incomprise', () => {
    expect(localeDepuisEnTete(null)).toBe('fr')
    expect(localeDepuisEnTete('')).toBe('fr')
    expect(localeDepuisEnTete('de,it;q=0.8')).toBe('fr')
  })
})
