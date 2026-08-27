import { describe, expect, it } from 'vitest'
import {
  annoncer, formaterPour, marcheDe, MARCHES, PAR_DEFAUT, type DonneePersonnelle,
} from './marche.ts'

const TOUT: DonneePersonnelle[] = [
  'photo', 'date-naissance', 'nationalite', 'situation-familiale', 'genre',
]

describe('le registre des marchés', () => {
  it('chaque convention porte sa NATURE et sa raison', () => {
    // « loi » et « usage » ne se disent pas de la même façon à l'utilisateur :
    // « je l'ai retirée » n'est pas la même phrase que « vous pourriez la
    // retirer ».
    for (const m of MARCHES) {
      expect(m.revuLe, m.pays).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const [d, c] of Object.entries(m.donnees)) {
        expect(['loi', 'usage'], `${m.pays}/${d}`).toContain(c.nature)
        expect(c.pourquoi.length, `${m.pays}/${d}`).toBeGreaterThan(40)
      }
    }
  })

  it('un pays non vérifié tombe sur le repli', () => {
    expect(marcheDe('JP')).toBe(PAR_DEFAUT)
    expect(marcheDe(null)).toBe(PAR_DEFAUT)
    expect(marcheDe('us').pays).toBe('US')
  })
})

describe('formaterPour — omise, pas masquée', () => {
  it('les États-Unis retirent tout ce qui expose à une discrimination', () => {
    // Un recruteur américain qui reçoit une photo et une date de naissance
    // peut écarter le dossier SANS LE LIRE : les garder l'expose à une plainte.
    const f = formaterPour('US', TOUT)
    expect(f.omissions.map((o) => o.donnee).sort()).toEqual([...TOUT].sort())
    expect(f.conservees).toEqual([])
    expect(f.omissions.every((o) => o.nature === 'loi')).toBe(true)
  })

  it('la France ne retire pas la photo — elle y est tolérée', () => {
    const f = formaterPour('FR', ['photo', 'date-naissance'])
    expect(f.omissions).toEqual([])
    expect(f.conservees).toContain('photo')
  })

  it('« inhabituelle » ne retire RIEN', () => {
    // Retirer sur la foi d'un usage reviendrait à décider à la place de
    // quelqu'un, et un usage se discute.
    const f = formaterPour('GB', ['situation-familiale'])
    expect(f.omissions).toEqual([])
    expect(f.conservees).toEqual(['situation-familiale'])
  })

  it('un marché non vérifié n’omet RIEN, et le dit', () => {
    // Omettre par précaution retirerait une information que le marché
    // attendait peut-être, sans que personne puisse dire pourquoi.
    const f = formaterPour('JP', TOUT)
    expect(f.omissions).toEqual([])
    expect(f.conservees).toEqual(TOUT)
    expect(f.marcheInconnu).toBe(true)
    expect(annoncer(f)).toMatch(/vous le connaissez mieux que moi/)
  })

  it('ce qui n’est pas dans le profil n’est pas « retiré »', () => {
    // On ne rapporte pas une omission qui n'a rien omis : ce serait dire
    // qu'on a fait quelque chose qu'on n'a pas fait.
    const f = formaterPour('US', ['photo'])
    expect(f.omissions.map((o) => o.donnee)).toEqual(['photo'])
  })
})

describe('annoncer — dire ce qui a été fait, et pourquoi', () => {
  it('nomme ce qui a été retiré, et insiste sur « du document »', () => {
    // Masquer une photo par une règle de style la laisse dans le fichier.
    // La phrase doit donc dire ce qui a réellement eu lieu.
    const a = annoncer(formaterPour('US', ['photo', 'date-naissance']))
    expect(a).toContain('votre photo')
    expect(a).toContain('votre date de naissance')
    expect(a).toMatch(/pas seulement de l’affichage/)
  })

  it('dit clairement quand il n’y avait rien à retirer', () => {
    expect(annoncer(formaterPour('FR', ['photo']))).toMatch(/Rien à retirer/)
  })
})
