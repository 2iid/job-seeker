import { describe, expect, it } from 'vitest'
import {
  enAttente, enseignements, LIBELLE_MOTIF, MOTIFS, MOTIFS_QUI_APPRENNENT, sortieDeFile,
  type ElementFile, type MotifRefus,
} from './approbation.ts'

const MAINTENANT = new Date('2026-08-26T12:00:00Z')

const elem = (o: Partial<ElementFile> = {}): ElementFile => ({
  id: 'e1', statut: 'en-file', expireLe: '2026-09-30T00:00:00Z', archiveeLe: null, ...o,
})

describe('sortieDeFile — jamais envoyé en silence après coup', () => {
  it('un élément encore valable reste en file', () => {
    expect(sortieDeFile(elem(), MAINTENANT).action).toBe('garder')
  })

  it('un élément EXPIRÉ est archivé, avec sa raison', () => {
    // Le mode d'échec qu'on prévient : quelqu'un s'absente une semaine,
    // revient, et l'agent envoie douze candidatures d'un coup — dont sept à
    // des offres fermées. Aucune n'a été décidée le jour où elle part.
    const s = sortieDeFile(elem({ expireLe: '2026-08-20T00:00:00Z' }), MAINTENANT)
    expect(s.action).toBe('archiver')
    expect(s.action === 'archiver' && s.raison).toMatch(/n’est pas la vôtre/)
  })

  it('un élément SANS échéance reste en file', () => {
    // Inventer une date serait pire que ne pas en avoir : elle archiverait une
    // offre encore ouverte, et la personne découvrirait que le produit a décidé
    // à sa place qu'il était trop tard.
    expect(sortieDeFile(elem({ expireLe: null }), MAINTENANT).action).toBe('garder')
  })

  it('un élément déjà archivé n’est pas ré-archivé', () => {
    expect(
      sortieDeFile(elem({ expireLe: '2020-01-01T00:00:00Z', archiveeLe: '2026-08-01T00:00:00Z' }), MAINTENANT)
        .action,
    ).toBe('garder')
  })
})

describe('enAttente — un bouton sans effet est une façon de mentir', () => {
  it('écarte l’expiré et l’archivé', () => {
    const liste = [
      elem({ id: 'valable' }),
      elem({ id: 'expire', expireLe: '2026-08-01T00:00:00Z' }),
      elem({ id: 'archive', archiveeLe: '2026-08-01T00:00:00Z' }),
      elem({ id: 'sans-echeance', expireLe: null }),
    ]
    expect(enAttente(liste, MAINTENANT).map((e) => e.id)).toEqual(['valable', 'sans-echeance'])
  })
})

describe('les motifs de refus', () => {
  it('chaque motif a un libellé écrit pour la personne', () => {
    for (const m of MOTIFS) {
      expect(LIBELLE_MOTIF[m], m).toBeTruthy()
      // « Autre » est court par nature ; le seuil vaut pour les motifs qui
      // doivent dire quelque chose.
      if (m !== 'autre') expect(LIBELLE_MOTIF[m].length, m).toBeGreaterThan(12)
    }
  })

  it('« autre » existe — un motif imposé qui ne correspond à rien fait choisir n’importe lequel', () => {
    expect(MOTIFS).toContain('autre')
  })

  it('tous les motifs n’enseignent PAS quelque chose', () => {
    // « L'intitulé ne correspond pas au poste décrit » parle de l'offre, pas
    // des critères : en tirer une leçon reviendrait à resserrer la recherche à
    // cause d'un employeur qui rédige mal.
    expect(MOTIFS_QUI_APPRENNENT).not.toContain('intitule-trompeur')
    expect(MOTIFS_QUI_APPRENNENT).not.toContain('document-inexact')
    expect(MOTIFS_QUI_APPRENNENT).toContain('salaire-insuffisant')
  })
})

describe('enseignements — apprendre sans suivre l’humeur du jour', () => {
  it('ne retient rien sous le seuil', () => {
    // Proposer de changer un critère après un seul refus apprendrait au
    // produit à suivre l'humeur du jour.
    expect(enseignements(['salaire-insuffisant', 'lieu'])).toEqual([])
  })

  it('retient un motif répété', () => {
    const m: MotifRefus[] = ['salaire-insuffisant', 'salaire-insuffisant', 'salaire-insuffisant', 'lieu']
    expect(enseignements(m)).toEqual([{ motif: 'salaire-insuffisant', occurrences: 3 }])
  })

  it('ignore les motifs qui ne disent rien des critères', () => {
    const m: MotifRefus[] = ['intitule-trompeur', 'intitule-trompeur', 'intitule-trompeur', 'intitule-trompeur']
    expect(enseignements(m)).toEqual([])
  })

  it('classe du plus fréquent au moins fréquent', () => {
    const m: MotifRefus[] = [
      'lieu', 'lieu', 'lieu', 'lieu',
      'salaire-insuffisant', 'salaire-insuffisant', 'salaire-insuffisant',
    ]
    expect(enseignements(m).map((e) => e.motif)).toEqual(['lieu', 'salaire-insuffisant'])
  })
})
