/**
 * JOB-023 — un `JobPosting` schema.org vers une offre brute.
 *
 * Ce lecteur ouvre à peu près toutes les pages carrières du monde : la donnée
 * structurée est ce que Google exige pour indexer une offre, donc à peu près
 * tout le monde la pose. C'est le connecteur au meilleur rapport
 * couverture/effort du moteur — et c'est aussi celui dont les données sont les
 * moins fiables, parce que personne ne les valide.
 *
 * ── Ce qui est REFUSÉ, et pourquoi ──
 *
 * · **Une offre expirée** (`validThrough` dépassé). L'afficher ferait perdre
 *   une candidature à quelqu'un, et pire : lui ferait croire que l'agent
 *   travaille pendant qu'il envoie dans le vide.
 *
 * · **Une offre sans URL de candidature.** Un `JobPosting` sans `url` décrit un
 *   poste sans dire où postuler. Le garder remplirait le flux d'offres sur
 *   lesquelles on ne peut rien faire.
 *
 * ── Ce qui est GARDÉ, mais marqué ──
 *
 * `datePosted` est une AFFIRMATION de la page, pas un fait. Une page peut
 * rafraîchir la sienne tous les jours sans que l'offre bouge — c'est même une
 * pratique de référencement courante. On la lit, mais on ne la traite pas
 * comme un relevé : c'est `lirePublication` en aval qui décide de la confiance,
 * et le palier de la source qui décide de ce qu'on a le droit d'en promettre.
 */

import type { OffreBrute } from '../contract.ts'
import { aLeType, aplatir } from './extraire.ts'

/** Une valeur schema.org peut être une chaîne, un nombre, ou un objet à `@value`. */
function texte(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return texte(v[0])
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    return texte(o['@value'] ?? o['name'])
  }
  return undefined
}

/**
 * Retire le balisage d'une description.
 *
 * `description` est du HTML dans la quasi-totalité des cas réels, et ce HTML
 * part ensuite vers un modèle. Deux raisons de le nettoyer ici plutôt que plus
 * loin : le balisage double la taille du contexte pour rien, et un `<script>`
 * recopié dans un journal ou rendu quelque part est un problème qu'on aura
 * créé soi-même en transportant du HTML dont on n'a pas besoin.
 */
export function texteDeDescription(v: unknown): string | undefined {
  const brut = texte(v)
  if (brut === undefined) return undefined
  const sansScript = brut
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
  const propre = sansScript
    .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return propre === '' ? undefined : propre
}

/** `jobLocation` : `PostalAddress` imbriquée, ou déjà une chaîne. */
export function lieuDe(v: unknown): string | undefined {
  const premier = Array.isArray(v) ? v[0] : v
  if (typeof premier === 'string') return premier.trim() || undefined
  if (typeof premier !== 'object' || premier === null) return undefined
  const o = premier as Record<string, unknown>
  const adresse = (o['address'] ?? o) as Record<string, unknown>
  const morceaux = [
    texte(adresse['addressLocality']),
    texte(adresse['addressRegion']),
    texte(adresse['addressCountry']),
  ].filter((m): m is string => m !== undefined && m !== '')
  if (morceaux.length > 0) return [...new Set(morceaux)].join(', ')
  return texte(o['name'])
}

/**
 * `baseSalary` vers un texte que `lireRemuneration` sait relire.
 *
 * On reconstruit une phrase plutôt que de rendre un montant : la lecture des
 * rémunérations vit déjà dans `normalisation.ts`, avec ses pièges (le suffixe
 * « k » d'une borne de plage, « / mois » qu'un `\b` ne voyait pas). Poser ici
 * une seconde lecture, c'est se garantir que les deux divergeront.
 */
export function remunerationTexte(v: unknown): string | undefined {
  const premier = Array.isArray(v) ? v[0] : v
  if (typeof premier === 'string') return premier.trim() || undefined
  if (typeof premier !== 'object' || premier === null) return undefined
  const o = premier as Record<string, unknown>
  const devise = texte(o['currency']) ?? texte(o['salaryCurrency']) ?? ''
  const valeur = o['value']
  if (typeof valeur === 'string' || typeof valeur === 'number') {
    return `${valeur} ${devise}`.trim()
  }
  if (typeof valeur !== 'object' || valeur === null) return undefined
  const q = valeur as Record<string, unknown>
  const min = texte(q['minValue'])
  const max = texte(q['maxValue'])
  const unique = texte(q['value'])
  const unite = texte(q['unitText'])?.toUpperCase()
  const PERIODE: Record<string, string> = {
    HOUR: '/ heure', DAY: '/ jour', WEEK: '/ semaine', MONTH: '/ mois', YEAR: '/ an',
  }
  const suffixe = unite !== undefined && PERIODE[unite] !== undefined ? ` ${PERIODE[unite]}` : ''
  const corps =
    min !== undefined && max !== undefined ? `${min} - ${max}`
    : (min ?? max ?? unique)
  if (corps === undefined) return undefined
  return `${corps} ${devise}${suffixe}`.replace(/\s+/g, ' ').trim()
}

/**
 * Le télétravail, tel que la spécification le déclare.
 *
 * `jobLocationType: "TELECOMMUTE"` est le seul marqueur normalisé ; le reste
 * du monde l'écrit dans le titre ou la description. On ne rend donc que ce
 * qu'on SAIT, et on laisse `presenceDeLOffre` faire son travail sur le texte —
 * inventer « présentiel » parce que le champ est absent serait le transformer
 * en rédhibitoire pour quelqu'un.
 */
export function teletravailTexte(o: Record<string, unknown>): string | undefined {
  const type = texte(o['jobLocationType'])
  if (type !== undefined && /telecommute/i.test(type)) return 'distanciel'
  const exigences = o['applicantLocationRequirements']
  const zone = lieuDe(exigences)
  return zone === undefined ? undefined : `distanciel depuis ${zone}`
}

export type OffreIgnoree = {
  readonly raison: 'expiree' | 'sans-url' | 'sans-titre'
  readonly titre?: string
}

export type LectureJobPosting = {
  readonly offres: readonly OffreBrute[]
  /** Ce qui a été écarté, avec la raison. Compté, jamais silencieux. */
  readonly ignorees: readonly OffreIgnoree[]
}

/**
 * Un identifiant stable pour une offre lue sur une page.
 *
 * `identifier` quand la page en donne un, sinon l'URL de candidature : c'est
 * elle qui désigne réellement l'offre. Se rabattre sur le titre ferait fusionner
 * deux postes homonymes ouverts dans deux villes.
 */
function identifiant(o: Record<string, unknown>, url: string): string {
  const brut = o['identifier']
  const id =
    typeof brut === 'string' ? brut
    : typeof brut === 'object' && brut !== null ? texte((brut as Record<string, unknown>)['value'])
    : undefined
  return id ?? url
}

export function lireJobPostings(
  blocs: readonly unknown[],
  maintenant: Date = new Date(),
): LectureJobPosting {
  const offres: OffreBrute[] = []
  const ignorees: OffreIgnoree[] = []

  for (const bloc of blocs) {
    for (const o of aplatir(bloc)) {
      if (!aLeType(o, 'JobPosting')) continue

      const titre = texte(o['title']) ?? texte(o['name'])
      if (titre === undefined) {
        ignorees.push({ raison: 'sans-titre' })
        continue
      }

      const validThrough = texte(o['validThrough'])
      if (validThrough !== undefined) {
        const fin = new Date(validThrough)
        if (!Number.isNaN(fin.getTime()) && fin.getTime() < maintenant.getTime()) {
          // Envoyer dans le vide est pire que ne rien envoyer : la personne
          // croit que l'agent travaille pendant qu'il ne se passe rien.
          ignorees.push({ raison: 'expiree', titre })
          continue
        }
      }

      const url = texte(o['url']) ?? texte(o['sameAs'])
      if (url === undefined) {
        ignorees.push({ raison: 'sans-url', titre })
        continue
      }

      const employeur =
        texte((o['hiringOrganization'] as Record<string, unknown> | undefined)?.['name'])
        ?? texte(o['hiringOrganization'])
        ?? ''

      offres.push({
        identifiantSource: identifiant(o, url),
        titre,
        employeur,
        urlCandidature: url,
        ...(texte(o['datePosted']) !== undefined ? { publieeLe: texte(o['datePosted'])! } : {}),
        ...(lieuDe(o['jobLocation']) !== undefined ? { lieu: lieuDe(o['jobLocation'])! } : {}),
        ...(remunerationTexte(o['baseSalary']) !== undefined
          ? { remunerationTexte: remunerationTexte(o['baseSalary'])! } : {}),
        ...(texteDeDescription(o['description']) !== undefined
          ? { description: texteDeDescription(o['description'])! } : {}),
        ...(teletravailTexte(o) !== undefined ? { teletravailTexte: teletravailTexte(o)! } : {}),
      })
    }
  }

  return { offres, ignorees }
}
