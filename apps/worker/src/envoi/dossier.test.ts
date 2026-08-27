import { describe, expect, it } from 'vitest'
import { annoncerPrepare, evaluerDossier, type Dossier, type Piece } from './dossier.ts'

const piece = (o: Partial<Piece> = {}): Piece => ({
  nature: 'cv', intitule: 'votre CV adapté', contenu: 'CV', relue: true, ...o,
})
const base = (pieces: Piece[], questions: string[] = []): Dossier => ({
  opportuniteId: 'op-1', canal: 'ats', pieces, questionsSansReponse: questions,
})
const COMPLET = base([
  piece(),
  piece({ nature: 'lettre', intitule: 'la lettre', contenu: 'Madame,' }),
])

describe('ce qui rend un dossier PRÊT', () => {
  it('un CV et une lettre, tous deux relus', () => {
    expect(evaluerDossier(COMPLET)).toEqual({ pret: true })
  })

  it('nomme ce qui manque plutôt que de dire « incomplet »', () => {
    const e = evaluerDossier(base([piece()]))
    expect(e.pret).toBe(false)
    if (!e.pret) expect(e.manques).toContain('la lettre')
  })

  it('une pièce VIDE ne compte pas comme présente', () => {
    const e = evaluerDossier(base([piece(), piece({ nature: 'lettre', intitule: 'la lettre', contenu: '   ' })]))
    expect(e.pret).toBe(false)
  })

  it('une pièce NON RELUE est un manque, pas un détail de qualité', () => {
    // REQ-007 : le produit n'a pas le droit de proposer d'envoyer un document
    // dont il n'a pas vérifié qu'il n'invente rien. « Presque prêt » n'existe
    // pas quand la personne va cliquer « envoyer ».
    const e = evaluerDossier(base([
      piece({ relue: false }),
      piece({ nature: 'lettre', intitule: 'la lettre', contenu: 'Madame,' }),
    ]))
    expect(e.pret).toBe(false)
    if (!e.pret) expect(e.manques.join(' ')).toMatch(/pas encore relue/)
  })

  it('une question de screening sans réponse bloque, et est NOMMÉE', () => {
    const e = evaluerDossier(base(COMPLET.pieces as Piece[], ['Combien d’années d’expérience ?']))
    expect(e.pret).toBe(false)
    if (!e.pret) expect(e.manques.join(' ')).toContain('Combien d’années')
  })
})

describe('ce que le produit ANNONCE', () => {
  it('parle de ce qu’il a préparé, jamais de ce qu’il a envoyé', () => {
    const a = annoncerPrepare(COMPLET, evaluerDossier(COMPLET))
    expect(a).toMatch(/prêt/)
    expect(a).toMatch(/le dernier geste est à vous/)
    // Le vocabulaire par défaut des agents, et celui que l'ADR-0003 interdit.
    expect(a).not.toMatch(/envoyé|transmis|candidature déposée|traitée/i)
  })

  it('énumère les pièces, pour qu’on sache quoi relire', () => {
    const a = annoncerPrepare(COMPLET, evaluerDossier(COMPLET))
    expect(a).toContain('votre CV adapté')
    expect(a).toContain('la lettre')
  })

  it('dit ce qui manque quand il n’a pas fini', () => {
    const d = base([piece()])
    expect(annoncerPrepare(d, evaluerDossier(d))).toMatch(/il manque la lettre/)
  })
})
