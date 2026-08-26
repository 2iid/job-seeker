import { type OffreBrute, type Palier } from './contract.ts'
import { type Publication, lirePublication, lireRemuneration, type Remuneration } from './normalisation.ts'

/**
 * JOB-027 — dédupliquer, et borner ce qui vient de l'extérieur.
 *
 * Deux responsabilités qui vont ensemble parce qu'elles portent sur le même
 * moment : l'instant où du texte écrit par un tiers entre dans le produit.
 *
 * Le contenu d'une offre est une ENTRÉE HOSTILE (OBL-6). Elle est écrite par
 * quelqu'un qu'on ne connaît pas, elle sera montrée à un utilisateur, et elle
 * sera plus tard donnée à un modèle qui rédige des emails. Rien n'entre sans
 * être borné en taille et validé en forme.
 */

/** Bornes volontairement généreuses : elles arrêtent l'absurde, pas le légitime. */
export const BORNES = {
  titre: 300,
  employeur: 200,
  lieu: 200,
  url: 2000,
  remunerationTexte: 300,
  description: 20_000,
} as const

export type MotifRejet =
  | 'titre-absent'
  | 'employeur-absent'
  | 'url-absente'
  | 'url-non-http'
  | 'url-trop-longue'

export type OffreNormalisee = {
  readonly cle: string
  readonly titre: string
  readonly employeur: string
  readonly employeurCanonique: string
  readonly lieu: string | null
  readonly urlCandidature: string
  readonly publication: Publication | null
  readonly remuneration: Remuneration | null
  readonly description: string | null
  /** Toutes les sources qui ont vu cette offre, la meilleure latence en tête. */
  readonly sources: readonly { source: string; palier: Palier; latenceSecondes: number }[]
}

export type Rejet = { readonly offre: OffreBrute; readonly motif: MotifRejet }

const borner = (v: string | undefined, max: number): string =>
  (v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Une URL de candidature doit être http(s). `javascript:` et `data:` sont les
 * cas d'école ; une URL relative est refusée aussi, parce qu'elle serait
 * résolue contre NOTRE origine et transformerait un lien externe en lien
 * interne.
 */
export function urlSure(brut: string | undefined): string | null {
  if (brut === undefined) return null
  const v = brut.trim()
  if (v === '' || v.length > BORNES.url) return null
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return null
  }
  return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
}

/** Suffixes juridiques : « Qonto SAS » et « Qonto » sont la même entreprise. */
const SUFFIXES = /\b(sas|sasu|sarl|sa|eurl|inc|llc|ltd|gmbh|bv|ab|oy|spa|srl|plc|pte|pty|corp|co)\b\.?/g

export function canoniserEmployeur(nom: string): string {
  return nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(SUFFIXES, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function canoniserTexte(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * La clé d'identité d'une offre : employeur + intitulé + lieu.
 *
 * Le LIEU en fait partie délibérément. Le même intitulé chez le même employeur
 * dans deux villes, ce sont deux postes, et fusionner les deux ferait
 * disparaître une opportunité réelle de l'écran d'un candidat.
 */
export function cleOffre(employeurCanonique: string, titre: string, lieu: string | null): string {
  return [employeurCanonique, canoniserTexte(titre), lieu === null ? '' : canoniserTexte(lieu)].join('|')
}

export type Entree = {
  readonly source: string
  readonly palier: Palier
  readonly latenceSecondes: number
  readonly offre: OffreBrute
}

/**
 * Déduplique un balayage. Renvoie aussi ce qui a été REJETÉ, avec le motif :
 * une offre écartée en silence est une offre qu'on ne saura jamais avoir ratée.
 */
export function dedupliquer(entrees: readonly Entree[]): {
  offres: readonly OffreNormalisee[]
  rejets: readonly Rejet[]
} {
  const par_cle = new Map<string, OffreNormalisee>()
  const rejets: Rejet[] = []

  for (const e of entrees) {
    const titre = borner(e.offre.titre, BORNES.titre)
    const employeur = borner(e.offre.employeur, BORNES.employeur)
    const url = urlSure(e.offre.urlCandidature)

    if (titre === '') { rejets.push({ offre: e.offre, motif: 'titre-absent' }); continue }
    if (employeur === '') { rejets.push({ offre: e.offre, motif: 'employeur-absent' }); continue }
    if (url === null) {
      const brut = e.offre.urlCandidature ?? ''
      rejets.push({
        offre: e.offre,
        motif: brut.trim() === '' ? 'url-absente' : brut.length > BORNES.url ? 'url-trop-longue' : 'url-non-http',
      })
      continue
    }

    const employeurCanonique = canoniserEmployeur(employeur)
    const lieu = borner(e.offre.lieu, BORNES.lieu) || null
    const cle = cleOffre(employeurCanonique, titre, lieu)
    const source = { source: e.source, palier: e.palier, latenceSecondes: e.latenceSecondes }

    const existante = par_cle.get(cle)
    if (existante === undefined) {
      par_cle.set(cle, {
        cle, titre, employeur, employeurCanonique, lieu,
        urlCandidature: url,
        publication: lirePublication(e.offre.publieeLe),
        remuneration: lireRemuneration(borner(e.offre.remunerationTexte, BORNES.remunerationTexte) || undefined),
        description: borner(e.offre.description, BORNES.description) || null,
        sources: [source],
      })
      continue
    }

    // Une source qui se répète ne gonfle pas le compte : c'est le nombre de
    // sources DISTINCTES qui renseigne l'utilisateur sur la corroboration.
    const dejaVue = existante.sources.some((s) => s.source === e.source)
    const sources = dejaVue
      ? existante.sources
      : [...existante.sources, source].sort((a, b) => a.latenceSecondes - b.latenceSecondes)

    par_cle.set(cle, {
      ...existante,
      sources,
      // On garde ce qu'on a de mieux : une source peut connaître le salaire
      // quand l'autre l'ignore, et une date précise vaut mieux qu'une absence.
      publication: existante.publication ?? lirePublication(e.offre.publieeLe),
      remuneration:
        existante.remuneration ??
        lireRemuneration(borner(e.offre.remunerationTexte, BORNES.remunerationTexte) || undefined),
      description: existante.description ?? (borner(e.offre.description, BORNES.description) || null),
    })
  }

  return { offres: [...par_cle.values()], rejets }
}

/**
 * La latence à AFFICHER pour une offre dédupliquée : la meilleure de ses
 * sources. Une offre vue à la fois sur un board et sur un agrégateur a bien
 * été vue à la minute — l'afficher comme lente serait se sous-vendre.
 */
export function meilleureLatence(o: OffreNormalisee): { palier: Palier; latenceSecondes: number } {
  const meilleure = o.sources[0]
  if (meilleure === undefined) return { palier: 'c', latenceSecondes: Number.POSITIVE_INFINITY }
  return { palier: meilleure.palier, latenceSecondes: meilleure.latenceSecondes }
}
