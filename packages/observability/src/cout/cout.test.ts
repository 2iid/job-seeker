import { describe, expect, it } from 'vitest'
import { coutEur, PEREMPTION_JOURS, TARIFS, tarif } from './tarifs.ts'
import { CANDIDATURE_NOMINALE_EUR, creerCompteur, PLAFOND_CANDIDATURE_EUR } from './budget.ts'

const LE_JOUR = new Date('2026-08-26T12:00:00Z')

describe('tarifs — un nombre sans date ne s’audite pas (F18)', () => {
  it('chaque tarif porte sa date et sa provenance', () => {
    // Le problème n'était pas qu'ils soient saisis à la main : c'est le bon
    // choix. C'était qu'un nombre sans date ne permet à personne de dire s'il
    // vaut encore, ni depuis quand il ne vaut plus.
    for (const [modele, t] of Object.entries(TARIFS)) {
      expect(t.releveLe, modele).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(t.source.length, modele).toBeGreaterThan(8)
      expect(t.inputEurParMillion, modele).toBeGreaterThan(0)
      expect(t.outputEurParMillion, modele).toBeGreaterThan(t.inputEurParMillion)
    }
  })

  it('un modèle inconnu n’a PAS de tarif par défaut', () => {
    // Le facturer au prix d'un autre produirait une facture fausse qui a
    // l'air juste — pire que pas de facture, parce qu'on croirait maîtriser
    // une dépense qu'on ne mesure plus.
    expect(tarif('modele-inconnu', LE_JOUR)).toEqual({ connu: false })
    expect(coutEur('modele-inconnu', 1_000_000, 1_000_000, LE_JOUR)).toBeNull()
  })

  it('un tarif trop vieux est marqué périmé, pas silencieusement appliqué', () => {
    const vieux = new Date(LE_JOUR.getTime() + (PEREMPTION_JOURS + 10) * 86_400_000)
    const e = tarif('claude-opus-5', vieux)
    expect(e.connu && e.perime).toBe(true)
    // Il reste utilisable : refuser de chiffrer serait pire que chiffrer en
    // le disant. Mais l'appelant sait désormais qu'il doit le revoir.
    expect(coutEur('claude-opus-5', 1_000_000, 0, vieux)).toBeGreaterThan(0)
  })

  it('le coût suit les tokens, entrée et sortie séparément', () => {
    const t = TARIFS['claude-opus-5']!
    expect(coutEur('claude-opus-5', 1_000_000, 0, LE_JOUR)).toBeCloseTo(t.inputEurParMillion, 6)
    expect(coutEur('claude-opus-5', 0, 1_000_000, LE_JOUR)).toBeCloseTo(t.outputEurParMillion, 6)
  })
})

describe('budget — un plafond qui avertit n’est pas un plafond', () => {
  const compteur = () => creerCompteur('cand-7', { maintenant: () => LE_JOUR })

  it('autorise tant que le plafond n’est pas atteint', () => {
    const c = compteur()
    expect(c.autoriser()).toBe(true)
    c.imputer('claude-opus-5', 2000, 1000)
    expect(c.autoriser()).toBe(true)
    expect(c.etat().depenseEur).toBeGreaterThan(0)
  })

  it('REFUSE une fois le plafond franchi', () => {
    // Le mode d'échec n'est pas une dépense visible : c'est une boucle qui
    // rappelle un modèle trente fois, la nuit, sur un compte qui ne regarde
    // pas. Une escalade se rattrape ; un mois de dépense, non.
    const c = compteur()
    for (let i = 0; i < 30 && c.autoriser(); i += 1) c.imputer('claude-opus-5', 200_000, 50_000)
    expect(c.autoriser()).toBe(false)
    expect(c.etat().depenseEur).toBeGreaterThanOrEqual(PLAFOND_CANDIDATURE_EUR)
  })

  it('la boucle s’arrête AVANT d’avoir tout dépensé, pas après', () => {
    // La borne est vérifiée avant l'appel : le dernier appel autorisé peut
    // dépasser, mais aucun ne part une fois le seuil franchi.
    const c = compteur()
    let appels = 0
    while (c.autoriser() && appels < 1000) { c.imputer('claude-opus-5', 200_000, 50_000); appels += 1 }
    expect(appels).toBeLessThan(1000)
    expect(c.etat().appels).toBe(appels)
  })

  it('un modèle sans tarif est COMPTÉ à part, jamais facturé au prix d’un autre', () => {
    const c = compteur()
    c.imputer('modele-inconnu', 500_000, 100_000)
    expect(c.etat().depenseEur).toBe(0)
    expect(c.etat().appelsSansTarif).toBe(1)
    // Et il n'ouvre pas une porte : un modèle sans tarif ne peut pas boucler
    // indéfiniment sous prétexte qu'il ne coûte « rien ».
    expect(c.etat().appels).toBe(1)
  })

  it('le plafond est par CANDIDATURE, pas global', () => {
    // Un plafond global protégerait le compte et laisserait une candidature
    // consommer la journée de tout le monde.
    const a = compteur()
    const b = creerCompteur('cand-8', { maintenant: () => LE_JOUR })
    while (a.autoriser()) a.imputer('claude-opus-5', 200_000, 50_000)
    expect(a.autoriser()).toBe(false)
    expect(b.autoriser()).toBe(true)
  })

  it('une candidature complète coûte ce que la constante annonce', () => {
    // Ce test est la SOURCE de `CANDIDATURE_NOMINALE_EUR`, pas sa
    // confirmation. La première version du plafond valait 0,20 € « avec de la
    // marge » ; ce test l'a démentie en mesurant 0,22 €, et c'est le plafond
    // qui a bougé. Le jour où les tarifs changent, c'est ici que ça se voit.
    const c = compteur()
    c.imputer('claude-opus-5', 1300, 1300) // lecture de CV — mesurée en réel
    c.imputer('claude-opus-5', 3000, 1500) // score
    c.imputer('claude-opus-5', 4000, 3000) // CV adapté
    c.imputer('claude-opus-5', 3000, 1500) // lettre
    expect(c.etat().depenseEur).toBeCloseTo(CANDIDATURE_NOMINALE_EUR, 2)
  })

  it('le plafond ne bloque PAS le travail normal, et laisse place aux reprises', () => {
    // Un plafond qui arrête un fonctionnement correct est le pire type de
    // plafond : il transforme le normal en incident.
    const c = compteur()
    let essais = 0
    while (c.autoriser() && essais < 20) {
      c.imputer('claude-opus-5', 1300, 1300)
      c.imputer('claude-opus-5', 3000, 1500)
      c.imputer('claude-opus-5', 4000, 3000)
      c.imputer('claude-opus-5', 3000, 1500)
      essais += 1
    }
    // Trois candidatures complètes passent — largement de quoi couvrir une
    // reprise après un refus du modèle ou une sortie illisible.
    expect(essais).toBeGreaterThanOrEqual(3)
    // Et ça s'arrête : une boucle ne peut pas courir la nuit.
    expect(essais).toBeLessThan(20)
    expect(c.autoriser()).toBe(false)
  })

  it('l’état nomme la candidature — un coût non imputable ne sert à rien', () => {
    expect(compteur().etat().candidatureId).toBe('cand-7')
  })
})
