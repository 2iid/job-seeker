import { describe, expect, it } from 'vitest'
import {
  deciderReprise,
  normaliserTitre,
  republicationProbable,
  type Anterieure,
  type EtatReclamation,
} from './idempotence.ts'

const MAINTENANT = new Date('2026-08-27T12:00:00Z')
const etat = (o: Partial<EtatReclamation>): EtatReclamation => ({
  issue: 'en-cours', bailJusquA: null, reclamePar: 'w1', ...o,
})

describe('deciderReprise — l’asymétrie qui décide de tout', () => {
  it('rien d’antérieur : on envoie', () => {
    expect(deciderReprise(null, MAINTENANT)).toEqual({ action: 'envoyer' })
  })

  it('DÉJÀ ENVOYÉ : doublon, refusé — le cœur de REQ-011', () => {
    const r = deciderReprise(etat({ issue: 'envoye' }), MAINTENANT)
    expect(r.action).toBe('doublon')
    if (r.action === 'doublon') expect(r.explication).toMatch(/déjà candidaté/)
  })

  it('un bail EN COURS : occupé, on n’y touche pas', () => {
    const r = deciderReprise(
      etat({ bailJusquA: new Date('2026-08-27T12:05:00Z') }), MAINTENANT)
    expect(r.action).toBe('occupe')
  })

  it('un bail EXPIRÉ devient INCERTAIN, jamais une nouvelle tentative', () => {
    // LE test de ce fichier. Un worker est mort en tenant la réclamation —
    // avant d'envoyer, ou après ; rien ne permet de le savoir. Présumer
    // l'échec et réessayer est le raisonnement qui envoie deux fois.
    const r = deciderReprise(
      etat({ bailJusquA: new Date('2026-08-27T11:59:00Z') }), MAINTENANT)
    expect(r.action).toBe('incertain')
    expect(r.action).not.toBe('envoyer')
  })

  it('un bail expiré depuis DES JOURS reste incertain', () => {
    // Le temps ne transforme pas une ignorance en certitude. C'est pourtant la
    // pente naturelle : « ça fait trois jours, ça a dû échouer ».
    const r = deciderReprise(
      etat({ bailJusquA: new Date('2026-08-20T00:00:00Z') }), MAINTENANT)
    expect(r.action).toBe('incertain')
  })

  it('une incertitude ne se résout pas en réessayant', () => {
    const r = deciderReprise(etat({ issue: 'incertain' }), MAINTENANT)
    expect(r.action).toBe('incertain')
  })

  it('« préparé » et « refusé » n’ont rien fait sortir : reprendre est sûr', () => {
    for (const issue of ['prepare', 'refuse'] as const)
      expect(deciderReprise(etat({ issue }), MAINTENANT).action, issue).toBe('envoyer')
  })

  it('AUCUN état n’autorise un envoi après une sortie possible', () => {
    // Vu autrement : la seule chose qui compte est qu'aucun chemin ne mène à
    // « envoyer » depuis un état où quelque chose a pu partir.
    const risques: EtatReclamation[] = [
      etat({ issue: 'envoye' }),
      etat({ issue: 'incertain' }),
      etat({ issue: 'en-cours', bailJusquA: new Date('2020-01-01T00:00:00Z') }),
      etat({ issue: 'en-cours', bailJusquA: null }),
    ]
    for (const e of risques)
      expect(deciderReprise(e, MAINTENANT).action, JSON.stringify(e)).not.toBe('envoyer')
  })
})

describe('normaliserTitre — reconnaître deux annonces du même poste', () => {
  it('ignore la casse, les accents et la ponctuation', () => {
    expect(normaliserTitre('Infirmier Diplômé d’État')).toBe(normaliserTitre('INFIRMIER DIPLOME D ETAT'))
  })

  it('ignore les mentions qui varient d’une republication à l’autre', () => {
    const base = normaliserTitre('Développeur backend')
    expect(normaliserTitre('Développeur backend (H/F)')).toBe(base)
    expect(normaliserTitre('Développeur backend H/F')).toBe(base)
    expect(normaliserTitre('Développeur backend — Réf. 12345')).toBe(base)
  })

  it('ne confond PAS deux postes différents', () => {
    expect(normaliserTitre('Développeur backend')).not.toBe(normaliserTitre('Développeur frontend'))
    expect(normaliserTitre('Infirmier')).not.toBe(normaliserTitre('Infirmier coordinateur'))
  })
})

describe('republicationProbable — le doublon que la clé primaire ne voit pas', () => {
  const ant = (o: Partial<Anterieure> = {}): Anterieure => ({
    employeurCanonique: 'exemple', titre: 'Développeur backend',
    envoyeLe: new Date('2026-08-01T00:00:00Z'), ...o,
  })
  const cible = { employeurCanonique: 'Exemple', titre: 'Développeur backend (H/F)' }

  it('repère la même annonce republiée sous une autre référence', () => {
    // La déduplication d'offres ne les rapproche pas : nouvelle référence,
    // nouvelle ligne, nouvelle opportunité. C'est pourtant le doublon que le
    // recruteur VOIT.
    expect(republicationProbable(cible, [ant()], MAINTENANT)).not.toBeNull()
  })

  it('laisse passer une candidature au même poste SIX MOIS plus tard', () => {
    // Une fenêtre non bornée transformerait une protection en interdiction :
    // recandidater un an après est légitime.
    expect(
      republicationProbable(cible, [ant({ envoyeLe: new Date('2026-01-01T00:00:00Z') })], MAINTENANT),
    ).toBeNull()
  })

  it('ne confond pas deux postes chez le même employeur', () => {
    expect(republicationProbable(cible, [ant({ titre: 'Développeur frontend' })], MAINTENANT)).toBeNull()
  })

  it('ne confond pas le même poste chez deux employeurs', () => {
    expect(republicationProbable(cible, [ant({ employeurCanonique: 'autre' })], MAINTENANT)).toBeNull()
  })

  it('sans antérieure, ne signale rien', () => {
    expect(republicationProbable(cible, [], MAINTENANT)).toBeNull()
  })
})
