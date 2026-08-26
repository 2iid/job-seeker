import { describe, expect, it } from 'vitest'
import type { OffreBrute, Palier } from './contract.ts'
import { BORNES, canoniserEmployeur, cleOffre, dedupliquer, meilleureLatence, urlSure, type Entree } from './dedupe.ts'

const offre = (o: Partial<OffreBrute> = {}): OffreBrute => ({
  identifiantSource: 'x',
  titre: 'Product Manager',
  employeur: 'Qonto',
  urlCandidature: 'https://jobs.ashbyhq.com/qonto/1',
  ...o,
})

const entree = (source: string, palier: Palier, latence: number, o: Partial<OffreBrute> = {}): Entree => ({
  source, palier, latenceSecondes: latence, offre: offre(o),
})

describe('F12 — rien n’entre sans être validé en forme', () => {
  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>'],
    ['/candidater/42'],
    ['jobs.example.com/1'],
    ['file:///etc/passwd'],
    [''],
    [undefined],
  ])('refuse une url de candidature en %s', (u) => {
    expect(urlSure(u)).toBeNull()
  })

  it('accepte http et https', () => {
    expect(urlSure('https://x.test/1')).toBe('https://x.test/1')
    expect(urlSure('http://x.test/1')).toBe('http://x.test/1')
  })

  it('rejette une offre dont l’url n’est pas suivable, avec son motif', () => {
    const { offres, rejets } = dedupliquer([entree('s', 'a', 60, { urlCandidature: 'javascript:x' })])
    expect(offres).toHaveLength(0)
    expect(rejets[0]?.motif).toBe('url-non-http')
  })

  it('une url démesurée est refusée avant d’être analysée', () => {
    const enorme = `https://x.test/${'a'.repeat(BORNES.url + 10)}`
    expect(dedupliquer([entree('s', 'a', 60, { urlCandidature: enorme })]).rejets[0]?.motif)
      .toBe('url-trop-longue')
  })
})

describe('F12 — rien n’entre sans être borné en taille', () => {
  it('un titre d’un mégaoctet ne fait pas gonfler la base', () => {
    const { offres } = dedupliquer([entree('s', 'a', 60, { titre: 'A'.repeat(1_000_000) })])
    expect(offres[0]?.titre.length).toBe(BORNES.titre)
  })

  it('borne aussi employeur, lieu et description', () => {
    const { offres } = dedupliquer([entree('s', 'a', 60, {
      employeur: 'E'.repeat(5000), lieu: 'L'.repeat(5000), description: 'D'.repeat(100_000),
    })])
    expect(offres[0]?.employeur.length).toBe(BORNES.employeur)
    expect(offres[0]?.lieu?.length).toBe(BORNES.lieu)
    expect(offres[0]?.description?.length).toBe(BORNES.description)
  })
})

describe('une offre sur laquelle on ne peut pas postuler n’est pas une offre', () => {
  it.each([
    [{ titre: '   ' }, 'titre-absent'],
    [{ employeur: '' }, 'employeur-absent'],
    [{ urlCandidature: '' }, 'url-absente'],
  ])('écarte %o avec le motif %s', (patch, motif) => {
    const { offres, rejets } = dedupliquer([entree('s', 'a', 60, patch)])
    expect(offres).toHaveLength(0)
    expect(rejets[0]?.motif, 'un rejet silencieux est une offre ratée sans le savoir').toBe(motif)
  })
})

describe('la même entreprise sous plusieurs orthographes', () => {
  it('ignore la casse, les accents et la forme juridique', () => {
    const a = canoniserEmployeur('Qonto')
    expect(canoniserEmployeur('QONTO')).toBe(a)
    expect(canoniserEmployeur('Qonto SAS')).toBe(a)
    expect(canoniserEmployeur('  Qonto  ')).toBe(a)
    expect(canoniserEmployeur('Doctolib')).not.toBe(a)
  })

  it('ne fusionne PAS deux entreprises qui se ressemblent', () => {
    // « Qonto » et « Qonto Bank » sont deux entités : les confondre ferait
    // disparaître les offres de l'une derrière celles de l'autre.
    expect(canoniserEmployeur('Qonto Bank')).not.toBe(canoniserEmployeur('Qonto'))
  })
})

describe('déduplication inter-sources et inter-paliers', () => {
  it('une offre vue sur deux sources devient UNE entrée portant les deux', () => {
    const { offres } = dedupliquer([
      entree('ashby', 'a', 180),
      entree('agregateur', 'b', 2400),
    ])
    expect(offres).toHaveLength(1)
    expect(offres[0]?.sources.map((s) => s.source).sort()).toEqual(['agregateur', 'ashby'])
  })

  it('la MEILLEURE latence est retenue, quel que soit l’ordre d’arrivée', () => {
    // Une offre vue à la fois sur un board et sur un agrégateur a bien été vue
    // à la minute : l'afficher comme lente serait se sous-vendre.
    for (const ordre of [
      [entree('agregateur', 'b', 2400), entree('ashby', 'a', 180)],
      [entree('ashby', 'a', 180), entree('agregateur', 'b', 2400)],
    ]) {
      const { offres } = dedupliquer(ordre)
      expect(meilleureLatence(offres[0]!)).toEqual({ palier: 'a', latenceSecondes: 180 })
    }
  })

  it('deux villes = deux postes, jamais fusionnés', () => {
    const { offres } = dedupliquer([
      entree('ashby', 'a', 180, { lieu: 'Paris' }),
      entree('ashby', 'a', 180, { lieu: 'Nantes' }),
    ])
    expect(offres, 'fusionner ferait disparaître une opportunité réelle').toHaveLength(2)
  })

  it('la même source qui se répète ne gonfle pas le compte de corroboration', () => {
    const { offres } = dedupliquer([entree('ashby', 'a', 180), entree('ashby', 'a', 180)])
    expect(offres).toHaveLength(1)
    expect(offres[0]?.sources).toHaveLength(1)
  })

  it('complète ce qui manque : une source connaît le salaire, l’autre non', () => {
    const { offres } = dedupliquer([
      entree('ashby', 'a', 180),
      entree('agregateur', 'b', 2400, { remunerationTexte: '65 – 78 k€ par an', publieeLe: '2026-08-25' }),
    ])
    expect(offres[0]?.remuneration?.texteOrigine).toContain('65')
    expect(offres[0]?.publication).not.toBeNull()
  })

  it('la clé distingue bien employeur, intitulé et lieu', () => {
    const base = cleOffre('qonto', 'Product Manager', 'Paris')
    expect(cleOffre('qonto', 'product manager', 'paris')).toBe(base)
    expect(cleOffre('qonto', 'Product Manager (H/F)', 'Paris')).toBe(base)
    expect(cleOffre('qonto', 'Product Designer', 'Paris')).not.toBe(base)
    expect(cleOffre('doctolib', 'Product Manager', 'Paris')).not.toBe(base)
  })
})
