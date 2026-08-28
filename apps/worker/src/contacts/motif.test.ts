import { describe, expect, it } from 'vitest'
import { decouper, deviner, MOTIFS, normaliser } from './motif.ts'
import { evaluer } from './certitude.ts'

describe('normaliser', () => {
  it('retire les diacritiques', () => {
    expect(normaliser('Élodie')).toBe('elodie')
    expect(normaliser('Müller')).toBe('muller')
  })

  it('CONSERVE le trait d’union d’un nom composé', () => {
    // Les employeurs le conservent : « jean-luc@ », pas « jeanluc@ ».
    expect(normaliser('Jean-Luc')).toBe('jean-luc')
  })

  it('retire tout le reste, y compris apostrophes et espaces', () => {
    expect(normaliser("O'Brien")).toBe('obrien')
    expect(normaliser('de la Tour')).toBe('delatour')
  })
})

describe('decouper — rendre null plutôt que parier', () => {
  it('découpe un prénom et un nom', () => {
    expect(decouper('Marie Dupont')).toEqual({ prenom: 'marie', nom: 'dupont' })
  })

  it('ignore une civilité', () => {
    expect(decouper('Dr. Marie Dupont')).toEqual({ prenom: 'marie', nom: 'dupont' })
  })

  it('REFUSE un nom qui ne se découpe pas de façon fiable', () => {
    // Une devinette bâtie sur un découpage faux est une devinette qui a l'air
    // d'un fait — le pire des deux mondes.
    for (const n of ['Marie-Claire Dupont de la Tour', 'Dupont', '', 'A B C D', '   '])
      expect(decouper(n), JSON.stringify(n)).toBeNull()
  })

  it('refuse une initiale seule', () => {
    expect(decouper('M Dupont')).toBeNull()
  })
})

describe('deviner', () => {
  it('produit une adresse par motif connu', () => {
    const s = deviner('Marie Dupont', 'exemple.fr')
    expect(s).toHaveLength(MOTIFS.length)
    expect(s.map((x) => x.adresse)).toContain('marie.dupont@exemple.fr')
    expect(s.map((x) => x.adresse)).toContain('mdupont@exemple.fr')
  })

  it('chaque devinette porte sa source, donc sa certitude', () => {
    for (const s of deviner('Marie Dupont', 'exemple.fr')) {
      expect(s.source).toBe('motif-de-domaine')
      expect(evaluer(s).certitude).toBe('devine')
    }
  })

  it('la justification NOMME le motif employé', () => {
    // Sans elle, la personne lit « adresse devinée » sans savoir d'où elle
    // sort, et ne peut pas juger si la devinette est plausible.
    expect(deviner('Marie Dupont', 'exemple.fr')[0]?.justification)
      .toContain('prenom.nom@exemple.fr')
  })

  it('ne devine RIEN sur un nom indécoupable', () => {
    expect(deviner('Dupont', 'exemple.fr')).toEqual([])
  })

  it('ne devine RIEN sur un domaine malformé', () => {
    // Deviner sur un domaine qu'on n'a pas établi produirait une adresse chez
    // un tiers, à qui on enverrait un CV.
    for (const d of ['', 'pas un domaine', 'exemple', 'http://exemple.fr', 'a@b.fr'])
      expect(deviner('Marie Dupont', d), d).toEqual([])
  })

  it('n’invente pas d’adresse générique — ce serait de la prospection', () => {
    // OBL-3 : finalité limitée. « recrutement@ » deviné à l'aveugle n'est pas
    // une mise en relation, c'est un démarchage.
    const adresses = deviner('Marie Dupont', 'exemple.fr').map((s) => s.adresse)
    for (const generique of ['contact@', 'info@', 'recrutement@', 'rh@', 'jobs@'])
      expect(adresses.some((a) => a.startsWith(generique))).toBe(false)
  })

  it('un nom composé garde son trait d’union dans l’adresse', () => {
    expect(deviner('Jean-Luc Martin', 'exemple.fr').map((s) => s.adresse))
      .toContain('jean-luc.martin@exemple.fr')
  })
})
