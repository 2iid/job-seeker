import { describe, expect, it } from 'vitest'
import { evaluerCompletude, resumer, type CriteresPourCompletude, type ProfilPourCompletude } from './completude.ts'
import { lireCodesPays } from './pays.ts'

const COMPLET: ProfilPourCompletude = {
  titreAccroche: 'Cheffe de projet marketing',
  autorisationTravail: ['SN', 'FR'],
  experiences: 2,
  competences: 5,
  aUnCv: true,
}

const CRITERES: NonNullable<CriteresPourCompletude> = {
  intitules: ['Chef de projet marketing'],
  presence: ['distanciel', 'hybride'],
  zones: ['Dakar'],
}

describe('evaluerCompletude', () => {
  it('un profil complet autorise tout', () => {
    const c = evaluerCompletude(COMPLET, CRITERES)
    expect(c.manques).toEqual([])
    expect(c.peutAutomatiser).toBe(true)
    expect(c.peutVeiller).toBe(true)
  })

  it("l'autorisation de travail manquante interdit l'automatisation, pas la veille", () => {
    // C'est la distinction utile : on peut chercher pour quelqu'un sans avoir
    // le droit de postuler pour lui. Tout confondre fermerait le produit à qui
    // n'a pas encore rempli une case.
    const c = evaluerCompletude({ ...COMPLET, autorisationTravail: [] }, CRITERES)
    expect(c.peutAutomatiser).toBe(false)
    expect(c.peutVeiller).toBe(true)
  })

  it('sans intitulé visé, la veille elle-même n’a pas de cible', () => {
    const c = evaluerCompletude(COMPLET, { ...CRITERES, intitules: [] })
    expect(c.peutVeiller).toBe(false)
  })

  it('une zone n’est exigée que si une présence est acceptée', () => {
    // Quelqu'un qui ne veut que du distanciel n'a aucune zone à déclarer.
    // L'exiger quand même serait une case à cocher pour rien — et sur un
    // produit mondial, ce serait la case qui écarte les gens.
    const distanciel = evaluerCompletude(COMPLET, { ...CRITERES, presence: ['distanciel'], zones: [] })
    expect(distanciel.manques.map((m) => m.cle)).not.toContain('zones')
    expect(distanciel.peutAutomatiser).toBe(true)

    const hybride = evaluerCompletude(COMPLET, { ...CRITERES, presence: ['hybride'], zones: [] })
    expect(hybride.manques.map((m) => m.cle)).toContain('zones')
    expect(hybride.peutAutomatiser).toBe(false)
  })

  it('un manque de qualité ne bloque rien', () => {
    const c = evaluerCompletude({ ...COMPLET, competences: 0, titreAccroche: '' }, CRITERES)
    expect(c.manques.map((m) => m.cle)).toEqual(['competences', 'accroche'])
    expect(c.peutAutomatiser).toBe(true)
    expect(c.peutVeiller).toBe(true)
  })

  it('chaque manque nomme ce qu’il empêche, et où aller', () => {
    // « Il manque votre autorisation de travail » n'apprend rien : on le
    // voyait, le champ est vide. La conséquence est ce qui donne une raison.
    const c = evaluerCompletude({ ...COMPLET, autorisationTravail: [], aUnCv: false }, null)
    for (const m of c.manques) {
      expect(m.empeche.length, m.cle).toBeGreaterThan(40)
      expect(m.ou, m.cle).toMatch(/^\//)
      expect(m.quoi, m.cle).not.toBe('')
    }
  })

  it('les manques sortent par gravité, pas par ordre de formulaire', () => {
    // Quelqu'un qui lit trois lignes doit lire les trois qui comptent.
    const c = evaluerCompletude(
      { titreAccroche: '', autorisationTravail: [], experiences: 0, competences: 0, aUnCv: false },
      null,
    )
    const portees = c.manques.map((m) => m.portee)
    const derniereBloquante = portees.lastIndexOf('automatisation')
    const premiereQualite = portees.indexOf('qualite')
    expect(premiereQualite).toBeGreaterThan(derniereBloquante)
  })
})

describe('resumer — le nombre et la conséquence, jamais « incomplet »', () => {
  it('distingue « je ne peux pas chercher » de « je ne postulerai pas seule »', () => {
    const rienDuTout = resumer(evaluerCompletude(
      { titreAccroche: '', autorisationTravail: [], experiences: 0, competences: 0, aUnCv: false }, null,
    ))
    expect(rienDuTout).toContain('chercher')

    const sansAutorisation = resumer(evaluerCompletude({ ...COMPLET, autorisationTravail: [] }, CRITERES))
    expect(sansAutorisation).toContain('pas seule')
    expect(sansAutorisation).not.toBe(rienDuTout)
  })

  it('ne dit pas la même chose à qui a tout rempli et à qui n’a rien rempli', () => {
    const complet = resumer(evaluerCompletude(COMPLET, CRITERES))
    const presque = resumer(evaluerCompletude({ ...COMPLET, competences: 0 }, CRITERES))
    expect(complet).not.toBe(presque)
    expect(presque).toContain('Rien n’est bloqué')
  })

  it('parle les deux langues', () => {
    const c = evaluerCompletude({ ...COMPLET, autorisationTravail: [] }, CRITERES)
    expect(resumer(c, 'en')).toMatch(/will not apply/)
    expect(resumer(c, 'fr')).not.toBe(resumer(c, 'en'))
  })
})

describe('lireCodesPays — normaliser sans deviner', () => {
  it('accepte les séparateurs et la casse', () => {
    expect(lireCodesPays('fr , sn;CA')).toEqual(['FR', 'SN', 'CA'])
  })

  it('ne devine pas un nom de pays', () => {
    // C'est le champ de l'autorisation de travail : le seul critère
    // rédhibitoire absolu. Un code mal deviné, et l'agent postule là où la
    // personne n'a pas le droit de travailler.
    expect(lireCodesPays('France, Sénégal')).toEqual([])
  })

  it('dédoublonne et ignore ce qui n’est pas un code à deux lettres', () => {
    expect(lireCodesPays('FR fr FRA 12 F')).toEqual(['FR'])
  })
})
