import { describe, expect, it } from 'vitest'
import { Cadence, EtatDesSources } from './cadence.ts'

/** Horloge pilotée : un test de retrait progressif qui dort vraiment ne serait jamais relancé. */
function horloge(depart = 1_000_000) {
  let t = depart
  return { maintenant: () => t, avancer: (ms: number) => { t += ms } }
}

describe('le plafond déclaré n’est jamais dépassé', () => {
  it('laisse passer jusqu’au plafond, puis refuse', () => {
    const h = horloge()
    const c = new Cadence(h.maintenant)
    for (let i = 0; i < 5; i += 1) expect(c.demander('ashby.test', 5).autorise, `appel ${i}`).toBe(true)
    const refus = c.demander('ashby.test', 5)
    expect(refus.autorise).toBe(false)
    expect(refus.autorise === false && refus.motif).toBe('cadence')
  })

  it('la fenêtre glisse : une minute plus tard, on repart', () => {
    const h = horloge()
    const c = new Cadence(h.maintenant)
    for (let i = 0; i < 3; i += 1) c.demander('x.test', 3)
    expect(c.demander('x.test', 3).autorise).toBe(false)
    h.avancer(60_001)
    expect(c.demander('x.test', 3).autorise).toBe(true)
  })

  it('chaque domaine a son propre compteur', () => {
    const h = horloge()
    const c = new Cadence(h.maintenant)
    c.demander('a.test', 1)
    expect(c.demander('a.test', 1).autorise).toBe(false)
    expect(c.demander('b.test', 1).autorise, 'un domaine saturé ne bloque pas les autres').toBe(true)
  })
})

describe('quand une source dit non, on l’écoute', () => {
  it('l’attente double à chaque refus consécutif', () => {
    const h = horloge()
    const c = new Cadence(h.maintenant)
    expect(c.refuse('ashby.test')).toBe(2000)
    expect(c.refuse('ashby.test')).toBe(4000)
    expect(c.refuse('ashby.test')).toBe(8000)
  })

  it('un Retry-After explicite l’emporte sur notre calcul', () => {
    // Quand une source nous dit combien de temps attendre, insister est une
    // faute, pas de l'optimisme.
    const h = horloge()
    const c = new Cadence(h.maintenant)
    c.refuse('x.test')
    expect(c.refuse('x.test', 120)).toBe(120_000)
  })

  it('l’attente est plafonnée — on ne s’exile pas une journée', () => {
    const h = horloge()
    const c = new Cadence(h.maintenant)
    for (let i = 0; i < 40; i += 1) c.refuse('x.test')
    expect(c.refuse('x.test')).toBe(15 * 60_000)
  })

  it('pendant la pénalité, aucun appel ne part', () => {
    const h = horloge()
    const c = new Cadence(h.maintenant)
    c.refuse('x.test', 60)
    const d = c.demander('x.test', 100)
    expect(d.autorise).toBe(false)
    expect(d.autorise === false && d.motif).toBe('penalite')
    h.avancer(60_001)
    expect(c.demander('x.test', 100).autorise).toBe(true)
  })

  it('un succès efface la pénalité — on ne punit pas une source qui va bien', () => {
    const h = horloge()
    const c = new Cadence(h.maintenant)
    c.refuse('x.test', 600)
    c.reussit('x.test')
    expect(c.demander('x.test', 10).autorise).toBe(true)
    expect(c.refuse('x.test'), 'le compteur de refus est reparti de zéro').toBe(2000)
  })
})

describe('« indisponible » ne dit rien sans « depuis quand »', () => {
  it('retient l’instant où l’état a CHANGÉ, pas le dernier essai', () => {
    const h = horloge()
    const e = new EtatDesSources(h.maintenant)
    e.noter('ashby', 'injoignable')
    h.avancer(10 * 60_000)
    e.noter('ashby', 'injoignable')
    expect(e.formuler('ashby')).toMatch(/depuis 10 min/)
  })

  it('remet le compteur à zéro quand l’état change', () => {
    const h = horloge()
    const e = new EtatDesSources(h.maintenant)
    e.noter('ashby', 'injoignable')
    h.avancer(30 * 60_000)
    e.noter('ashby', 'quota-atteint')
    expect(e.formuler('ashby')).toMatch(/quota-atteint à l'instant/)
  })

  it('une source qui va bien ne produit aucune phrase', () => {
    const h = horloge()
    const e = new EtatDesSources(h.maintenant)
    e.noter('greenhouse', 'ok')
    expect(e.formuler('greenhouse')).toBeNull()
    e.noter('greenhouse', 'aucun-resultat')
    expect(e.formuler('greenhouse'), 'aucun résultat est une vraie réponse').toBeNull()
  })

  it('la phrase se termine par ce que ça n’implique PAS', () => {
    const h = horloge()
    const e = new EtatDesSources(h.maintenant)
    e.noter('ashby', 'auth-refusee')
    expect(e.formuler('ashby')).toMatch(/Ce n'est pas une absence d'offres/)
  })

  it('garde la dernière réussite même en panne — on sait ce qu’on a raté', () => {
    const h = horloge()
    const e = new EtatDesSources(h.maintenant)
    e.noter('ashby', 'ok')
    const reussite = e.observation('ashby')?.derniereReussite
    h.avancer(3_600_000)
    e.noter('ashby', 'injoignable')
    expect(e.observation('ashby')?.derniereReussite).toBe(reussite)
  })

  it('liste les sources qui interdisent de conclure', () => {
    const h = horloge()
    const e = new EtatDesSources(h.maintenant)
    e.noter('ashby', 'injoignable')
    e.noter('greenhouse', 'ok')
    e.noter('lever', 'format-change')
    expect(e.aveugles().map((o) => o.source).sort()).toEqual(['ashby', 'lever'])
  })
})
