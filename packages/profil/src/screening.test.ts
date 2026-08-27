import { describe, expect, it } from 'vitest'
import { bloquantes, reconnaitre, repondreA, type ReponseStockee } from './screening.ts'

const validee = (cle: ReponseStockee['cle'], reponse: string): ReponseStockee => ({
  cle, question: 'x', reponse, valideeLe: '2026-08-01T00:00:00Z',
})

const BIBLIOTHEQUE: ReponseStockee[] = [
  validee('pretentions', '45 000 € brut annuel, négociable'),
  validee('disponibilite', 'Sous un mois'),
  { cle: 'preavis', question: 'x', reponse: 'Un mois', valideeLe: null },
]

describe('reconnaitre — ce qu’on reconnaît SÛREMENT, et rien d’autre', () => {
  it('reconnaît les formulations courantes, en français et en anglais', () => {
    expect(reconnaitre('Quelles sont vos prétentions salariales ?')).toBe('pretentions')
    expect(reconnaitre('What are your salary expectations?')).toBe('pretentions')
    expect(reconnaitre('Quelle est votre date de disponibilité ?')).toBe('disponibilite')
    expect(reconnaitre('When can you start?')).toBe('disponibilite')
    expect(reconnaitre('Are you legally authorized to work in Canada?')).toBe('autorisation-travail')
    expect(reconnaitre('Durée de préavis ?')).toBe('preavis')
  })

  it('rend `undefined` sur une question qu’il ne reconnaît pas', () => {
    // Un système volontairement peu couvrant : il vaut mieux escalader souvent
    // que se tromper une fois.
    expect(reconnaitre('Décrivez un conflit que vous avez résolu.')).toBeUndefined()
    expect(reconnaitre('Pourquoi nous ?')).toBeUndefined()
  })

  it('rend `undefined` quand PLUSIEURS motifs reconnaissent', () => {
    // Une question ambiguë est le cas dangereux : répondre à l'une des deux
    // serait un pari, et le pari se joue sur une affirmation envoyée en votre
    // nom.
    expect(reconnaitre('Acceptez-vous le télétravail ou seriez-vous prêt à déménager ?'))
      .toBeUndefined()
  })

  it('un motif n’attrape pas la question du voisin', () => {
    // « salaire » seul ne suffit pas à déclencher `pretentions` : « quel est
    // le salaire du poste ? » n'est pas « quelles sont vos prétentions ».
    expect(reconnaitre('Le salaire est-il négociable dans votre entreprise ?')).toBeUndefined()
    expect(reconnaitre('Combien de déplacements par mois ?')).toBeUndefined()
  })
})

describe('repondreA — une réponse validée, ou rien', () => {
  it('rend la réponse quand elle est validée', () => {
    const r = repondreA('Vos prétentions salariales ?', BIBLIOTHEQUE)
    expect(r.repondre).toBe(true)
    expect(r.repondre === true && r.reponse).toContain('45 000')
  })

  it('REFUSE une réponse non validée — une suggestion n’est pas une réponse', () => {
    // « Disponible immédiatement » posé par un modèle et envoyé sans relecture
    // est exactement le genre de phrase qu'un recruteur retient contre
    // quelqu'un.
    const r = repondreA('Quelle est votre durée de préavis ?', BIBLIOTHEQUE)
    expect(r.repondre).toBe(false)
    expect(r.repondre === false && r.motif).toBe('non-validee')
  })

  it('refuse quand rien n’est enregistré', () => {
    const r = repondreA('Seriez-vous prêt à déménager ?', BIBLIOTHEQUE)
    expect(r.repondre === false && r.motif).toBe('aucune-reponse')
  })

  it('refuse — et n’invente JAMAIS — sur une question inconnue', () => {
    const r = repondreA('Décrivez votre plus grand échec.', BIBLIOTHEQUE)
    expect(r.repondre === false && r.motif).toBe('non-reconnue')
    expect(r.repondre === false && r.explication).toMatch(/plutôt que de répondre à côté/)
  })
})

describe('bloquantes — REQ-008 : une seule suffit à bloquer', () => {
  it('rend la LISTE, pas un booléen', () => {
    // La personne doit savoir ce qu'on lui demande de faire, pas seulement
    // qu'on lui demande quelque chose.
    const b = bloquantes(
      ['Vos prétentions salariales ?', 'Durée de préavis ?', 'Pourquoi nous ?'],
      BIBLIOTHEQUE,
    )
    expect(b).toHaveLength(2)
    expect(b.map((x) => x.question)).toContain('Pourquoi nous ?')
    for (const x of b) expect(x.explication.length).toBeGreaterThan(40)
  })

  it('aucune bloquante quand tout est répondu et validé', () => {
    expect(bloquantes(['Vos prétentions salariales ?', 'When can you start?'], BIBLIOTHEQUE))
      .toEqual([])
  })

  it('une seule question sans réponse bloque tout le lot', () => {
    expect(bloquantes(['Vos prétentions salariales ?', 'Pourquoi nous ?'], BIBLIOTHEQUE))
      .toHaveLength(1)
  })
})
