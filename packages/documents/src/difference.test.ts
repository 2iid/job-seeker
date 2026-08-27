import { describe, expect, it } from 'vitest'
import { appliquer, differencier, modifications, segmenter } from './difference.ts'

const ORIGINE = 'Pilotage du budget d’acquisition et de trois agences.'
const PROPOSE = 'Pilotage du budget d’acquisition et coordination de trois agences externes.'

describe('segmenter — le grain décide de ce qui est relu', () => {
  it('ne marque que ce qui a changé', () => {
    // Un diff de lignes rendrait « toute la ligne a changé » sur un adjectif
    // remplacé — la relecture coûterait autant que réécrire soi-même, et la
    // personne accepterait en bloc.
    const s = segmenter(ORIGINE, PROPOSE)
    const gardes = s.filter((x) => x.type === 'garde').map((x) => x.texte).join('')
    expect(gardes).toContain('Pilotage du budget')
    // « trois agences » est conservé D'UN SEUL TENANT, point compris ailleurs.
    // Avec la ponctuation collée au mot, « agences. » et « agences » étaient
    // deux jetons différents et toute la fin de phrase paraissait réécrite.
    expect(gardes).toContain('de trois agences')
  })

  it('la ponctuation ne grossit pas la différence', () => {
    // Remplacer « trois agences. » par « trois agences externes. » ne doit
    // marquer QUE le mot inséré.
    const s = segmenter('trois agences.', 'trois agences externes.')
    expect(s.filter((x) => x.type === 'retire')).toEqual([])
    expect(modifications(s)).toHaveLength(1)
  })

  it('recompose exactement l’origine et la proposition', () => {
    // La propriété qui rend le reste sûr : rien n'est perdu au découpage.
    const s = segmenter(ORIGINE, PROPOSE)
    const origine = s.filter((x) => x.type !== 'ajoute').map((x) => x.texte).join('')
    const propose = s.filter((x) => x.type !== 'retire').map((x) => x.texte).join('')
    expect(origine).toBe(ORIGINE)
    expect(propose).toBe(PROPOSE)
  })

  it('deux textes identiques ne produisent aucune modification', () => {
    expect(modifications(segmenter(ORIGINE, ORIGINE))).toEqual([])
  })

  it('un texte vide d’un côté n’est pas un cas particulier', () => {
    expect(segmenter('', 'ajouté').every((s) => s.type === 'ajoute')).toBe(true)
    expect(segmenter('retiré', '').every((s) => s.type === 'retire')).toBe(true)
  })
})

describe('modifications — un remplacement est UNE décision', () => {
  it('un retrait suivi d’un ajout ne fait qu’une modification', () => {
    // Les présenter séparément demanderait d'accepter une suppression sans
    // voir ce qui vient à la place. Ce n'est pas une décision qu'on peut
    // prendre.
    const m = modifications(segmenter('équipe de designers', 'équipe de développeurs'))
    expect(m).toHaveLength(1)
    expect(m[0]!.retire).toContain('designers')
    expect(m[0]!.ajoute).toContain('développeurs')
  })

  it('les identifiants sont STABLES entre deux exécutions', () => {
    // C'est ce qui permet de conserver un refus : un identifiant qui change
    // ferait réapparaître une modification déjà refusée.
    const a = modifications(segmenter(ORIGINE, PROPOSE)).map((m) => m.id)
    const b = modifications(segmenter(ORIGINE, PROPOSE)).map((m) => m.id)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
  })
})

describe('appliquer — refuser, c’est revenir à ce qu’on avait écrit', () => {
  it('tout accepté rend la proposition', () => {
    const s = segmenter(ORIGINE, PROPOSE)
    expect(appliquer(s, new Set())).toBe(PROPOSE)
  })

  it('tout refusé rend l’ORIGINE, mot pour mot', () => {
    // Pas un vide, pas une proposition atténuée : ce que la personne avait
    // écrit elle-même.
    const s = segmenter(ORIGINE, PROPOSE)
    const toutes = new Set(modifications(s).map((m) => m.id))
    expect(appliquer(s, toutes)).toBe(ORIGINE)
  })

  it('un refus isolé ne touche PAS les autres modifications', () => {
    const s = segmenter(ORIGINE, PROPOSE)
    const mods = modifications(s)
    expect(mods.length).toBeGreaterThan(1)
    const resultat = appliquer(s, new Set([mods[0]!.id]))
    expect(resultat).not.toBe(ORIGINE)
    expect(resultat).not.toBe(PROPOSE)
    // La modification refusée est revenue à l'origine…
    expect(resultat).toContain(mods[0]!.retire.trim())
    // …et celle qui suit est bien appliquée.
    expect(resultat).toContain(mods[1]!.ajoute.trim())
  })

  it('un identifiant inconnu ne fait rien exploser', () => {
    const s = segmenter(ORIGINE, PROPOSE)
    expect(appliquer(s, new Set(['m999']))).toBe(PROPOSE)
  })

  it('le résultat reste un texte lisible, sans espaces doublés', () => {
    const s = segmenter(ORIGINE, PROPOSE)
    for (const refus of [new Set<string>(), new Set(['m0']), new Set(modifications(s).map((m) => m.id))]) {
      expect(appliquer(s, refus)).not.toMatch(/ {2,}/)
    }
  })
})

describe('differencier', () => {
  it('rend le champ, ses segments et ses modifications', () => {
    const d = differencier('description', ORIGINE, PROPOSE)
    expect(d.champ).toBe('description')
    expect(d.modifications.length).toBeGreaterThan(0)
    expect(appliquer(d.segments, new Set())).toBe(PROPOSE)
  })
})
