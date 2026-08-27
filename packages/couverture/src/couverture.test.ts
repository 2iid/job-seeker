import { describe, expect, it } from 'vitest'
import { annoncerCouverture, evaluer, expliquerFluxVide, type Observation } from './couverture.ts'

/**
 * Les observations reproduisent ce que `JOB-076` a MESURÉ le 2026-08-26 :
 * 393 offres, 151 aux États-Unis, zéro en Afrique, zéro en Amérique du Sud
 * hors Mexique.
 */
const MESURE: Observation[] = [
  {
    source: 'agregateur-arbeitnow', palier: 'b', offres: 175,
    paysObserves: ['US', 'DE', 'GB', 'REMOTE'], paysDeclares: 'monde',
  },
  {
    source: 'agregateur-remotive', palier: 'b', offres: 18,
    paysObserves: ['US', 'REMOTE'], paysDeclares: 'monde',
  },
  {
    source: 'agregateur-jobicy', palier: 'b', offres: 200,
    paysObserves: ['US', 'GB', 'CA', 'MX', 'REMOTE'], paysDeclares: 'monde',
  },
]

describe('déclaré n’est pas observé', () => {
  it('signale l’écart d’une source qui se dit mondiale', () => {
    // Les trois connecteurs déclarent `pays: 'monde'`. La mesure a montré
    // zéro offre en Afrique. Une portée déclarée est une promesse du
    // fournisseur ; une portée observée est un fait relevé chez nous.
    const v = evaluer(MESURE, { pays: 'SN', accepteDistanciel: false })
    expect(v.ecartDeclare).toHaveLength(3)
    expect(v.ecartDeclare[0]!.declare).toBe('monde')
    expect(v.ecartDeclare[0]!.observe).not.toContain('SN')
  })

  it('aucun écart quand la source a réellement servi ce pays', () => {
    expect(evaluer(MESURE, { pays: 'US', accepteDistanciel: false }).ecartDeclare).toEqual([])
  })
})

describe('evaluer — ce qui couvre vraiment', () => {
  it('l’infirmier de Nantes n’a AUCUNE source locale', () => {
    // Le cas exact de JOB-076 : présentiel obligatoire, en France.
    const v = evaluer(MESURE, { pays: 'FR', accepteDistanciel: false })
    expect(v.aucuneSourceLocale).toBe(true)
    expect(v.sourcesCouvrantes).toEqual([])
  })

  it('mais il en a s’il accepte le distanciel', () => {
    // Une source qui ne rend que du distanciel couvre quelqu'un qui l'accepte,
    // où qu'il soit — c'est même sa raison d'être.
    const v = evaluer(MESURE, { pays: 'FR', accepteDistanciel: true })
    expect(v.aucuneSourceLocale).toBe(false)
    expect(v.sourcesCouvrantes).toHaveLength(3)
  })

  it('une source MUETTE ne couvre rien, même si elle déclare le pays', () => {
    // Zéro offre est une information, pas une absence de source à compter.
    const muette: Observation[] = [
      { source: 'x', palier: 'b', offres: 0, paysObserves: ['FR'], paysDeclares: ['FR'] },
    ]
    expect(evaluer(muette, { pays: 'FR', accepteDistanciel: false }).sourcesCouvrantes).toEqual([])
  })

  it('sans pays visé, on ne conclut pas à une lacune', () => {
    expect(evaluer(MESURE, { pays: null, accepteDistanciel: false }).aucuneSourceLocale).toBe(false)
  })
})

describe('expliquerFluxVide — deux phrases, et il faut la bonne', () => {
  it('sans source locale, il dit que la lacune est DE NOTRE CÔTÉ', () => {
    // « Je n'ai rien trouvé qui vous corresponde » renvoie la personne à son
    // profil. « Je n'ai aucune source qui couvre » nous renvoie à notre
    // travail. Dire la première quand la seconde est vraie fait porter à
    // quelqu'un un échec qui est le nôtre.
    const m = expliquerFluxVide(
      evaluer(MESURE, { pays: 'SN', accepteDistanciel: false }),
      { pays: 'SN', accepteDistanciel: false },
    )
    expect(m).toMatch(/lacune de ma couverture/)
    expect(m).toMatch(/de mon côté/)
    // On ne cherche pas à bannir les mots « absence d'offres » : le message
    // les emploie pour les NIER, et c'est précisément son propos. Ce qu'on
    // vérifie, c'est qu'il les nie.
    expect(m).toMatch(/Ce n’est pas une absence d’offres/)
  })

  it('avec des sources couvrantes, il parle du MARCHÉ et pas de nous', () => {
    const m = expliquerFluxVide(
      evaluer(MESURE, { pays: 'US', accepteDistanciel: true }),
      { pays: 'US', accepteDistanciel: true },
    )
    expect(m).toMatch(/aucune n’avait d’offre correspondant/)
    expect(m).toMatch(/Je continue/)
  })

  it('il propose le distanciel à qui ne l’a pas ouvert', () => {
    const m = expliquerFluxVide(
      evaluer(MESURE, { pays: 'SN', accepteDistanciel: false }),
      { pays: 'SN', accepteDistanciel: false },
    )
    expect(m).toMatch(/Ouvrir le distanciel/)
  })
})

describe('annoncerCouverture — JOB-087', () => {
  it('n’annonce JAMAIS « mondiale, tous secteurs »', () => {
    // La mesure de JOB-076 interdit cette phrase tant qu'elle tient. L'écrire
    // quand même vendrait une portée qu'on n'a pas — la seule chose qu'un
    // produit d'agent autonome ne peut pas se permettre, puisque sa valeur
    // entière repose sur le fait qu'on puisse le croire.
    const a = annoncerCouverture(MESURE)
    expect(a).not.toMatch(/mondial|monde entier|tous (les )?pays|tous (les )?secteurs/i)
  })

  it('annonce ce qui est CONSTATÉ, en le disant', () => {
    const a = annoncerCouverture(MESURE)
    expect(a).toMatch(/constaté et non promis/)
    expect(a).toContain('US')
    expect(a).toMatch(/distancielles/)
  })

  it('invite à signaler un marché manquant — c’est ce qui décide de la suite', () => {
    expect(annoncerCouverture(MESURE)).toMatch(/dites-le-moi/)
  })

  it('sans rien relevé, il ne promet RIEN', () => {
    expect(annoncerCouverture([])).toMatch(/rien vous promettre/)
  })
})
