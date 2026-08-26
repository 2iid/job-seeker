import { describe, expect, it } from 'vitest'
import { afficherDate, lireDate } from './dates.ts'

describe('lireDate — on ne rend jamais plus précis que le CV', () => {
  it('une année reste une année', () => {
    // Le 1er janvier est un ancrage de tri, PAS une date écrite par quelqu'un.
    expect(lireDate('2021')).toEqual({ iso: '2021-01-01', precision: 'annee' })
    expect(afficherDate(lireDate('2021')!)).toBe('2021')
  })

  it('un mois nommé reste un mois, dans les deux langues', () => {
    expect(lireDate('mars 2019')).toEqual({ iso: '2019-03-01', precision: 'mois' })
    expect(lireDate('September 2019')).toEqual({ iso: '2019-09-01', precision: 'mois' })
    expect(afficherDate(lireDate('mars 2019')!)).toBe('mars 2019')
  })

  it('lit les formats numériques sans confondre le jour et le mois', () => {
    expect(lireDate('12/03/2019')).toEqual({ iso: '2019-03-12', precision: 'jour' })
    expect(lireDate('2019-03-12')).toEqual({ iso: '2019-03-12', precision: 'jour' })
    expect(lireDate('03/2019')).toEqual({ iso: '2019-03-01', precision: 'mois' })
  })

  it('« aujourd’hui » n’est pas une date, c’est une absence de fin', () => {
    for (const s of ["aujourd'hui", 'en cours', 'present', 'Current']) {
      expect(lireDate(s), s).toBeNull()
    }
  })

  it('rend null plutôt que de deviner', () => {
    // Un null fait marquer le champ « à vérifier ». Deviner transformerait une
    // lecture ratée en une date fausse que personne ne relira.
    expect(lireDate('')).toBeNull()
    expect(lireDate('il y a longtemps')).toBeNull()
  })

  it('ne devine pas une plage entière — elle sera signalée, pas interprétée', () => {
    // Si le modèle range « 2021 — aujourd'hui » dans le champ DÉBUT au lieu de
    // le découper, on rend null. Extraire « 2021 » serait probablement juste,
    // et c'est précisément le problème : « probablement juste » enregistré en
    // silence est ce que cette fonctionnalité existe pour empêcher. Un null
    // fait marquer le champ « à vérifier », et quelqu'un tranche.
    expect(lireDate('2021 — aujourd’hui')).toBeNull()
    expect(lireDate('2021')).toEqual({ iso: '2021-01-01', precision: 'annee' })
  })

  it('affiche un jour comme un jour', () => {
    expect(afficherDate({ iso: '2019-03-12', precision: 'jour' })).toBe('12 mars 2019')
  })
})
