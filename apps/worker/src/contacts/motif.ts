/**
 * JOB-065 — déduire une adresse d'un motif de nommage.
 *
 * ── Pourquoi ce fichier existe malgré tout ──
 *
 * Deviner l'adresse d'une personne nommée est un geste qui mérite d'être
 * discuté plutôt que codé en passant. REQ-016 l'autorise explicitement — « une
 * adresse devinée est présentée comme devinée » — parce que sans cela, sortir
 * de la file des candidatures anonymes est impossible pour la plupart des
 * offres.
 *
 * Trois garde-fous, dans le code et pas dans l'intention :
 *   1. le résultat est TOUJOURS `devine`, donc jamais une destination
 *      d'envoi automatique (`utilisablesCommeDestination`) ;
 *   2. le domaine doit être un domaine VÉRIFIÉ de l'employeur — deviner sur un
 *      domaine qu'on n'a pas établi produirait une adresse chez un tiers ;
 *   3. on ne devine que pour une personne NOMMÉE dans une source légitime. On
 *      n'invente pas « recrutement@ » : ça, c'est de la prospection à
 *      l'aveugle, et OBL-3 dit finalité limitée.
 */

import type { Signal } from './certitude.ts'

/** Les formes courantes, du plus au moins répandu en Europe. */
export const MOTIFS = [
  { gabarit: '{prenom}.{nom}', libelle: 'prenom.nom' },
  { gabarit: '{prenom}', libelle: 'prenom' },
  { gabarit: '{p}{nom}', libelle: 'pnom' },
  { gabarit: '{prenom}{nom}', libelle: 'prenomnom' },
  { gabarit: '{nom}.{prenom}', libelle: 'nom.prenom' },
] as const

/** Retire les diacritiques et tout ce qui n'est pas une lettre latine. */
export function normaliser(part: string): string {
  return part
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Un nom composé donne « jean-luc », pas « jeanluc » : le trait d'union
    // est conservé parce que les employeurs le conservent.
    .replace(/[^a-z-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export type Personne = { readonly prenom: string; readonly nom: string }

/**
 * Découpe un nom complet. Rend `null` plutôt que de parier.
 *
 * « Marie Dupont » se découpe. « Dr. Marie-Claire Dupont de la Tour » ne se
 * découpe pas de façon fiable, et une devinette bâtie sur un découpage faux est
 * une devinette qui a l'air d'un fait.
 */
export function decouper(nomComplet: string): Personne | null {
  const parts = nomComplet
    .trim()
    .split(/\s+/)
    .filter((p) => !/^(?:dr|m|mme|mr|mrs|ms|prof)\.?$/i.test(p))
  if (parts.length !== 2) return null
  const prenom = normaliser(parts[0] ?? '')
  const nom = normaliser(parts[1] ?? '')
  if (prenom.length < 2 || nom.length < 2) return null
  return { prenom, nom }
}

/**
 * Les adresses possibles pour cette personne sur ce domaine.
 *
 * `domaineVerifie` est un domaine que le REGISTRE a établi, jamais une chaîne
 * lue dans une annonce. Le paramètre s'appelle ainsi pour que l'appelant
 * remarque ce qu'il affirme en le passant.
 */
export function deviner(
  nomComplet: string,
  domaineVerifie: string,
  poste?: string,
): readonly Signal[] {
  const p = decouper(nomComplet)
  if (p === null) return []
  const domaine = domaineVerifie.trim().toLowerCase()
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domaine)) return []

  return MOTIFS.map((m) => {
    const locale = m.gabarit
      .replace('{prenom}', p.prenom)
      .replace('{nom}', p.nom)
      .replace('{p}', p.prenom.slice(0, 1))
    return {
      adresse: `${locale}@${domaine}`,
      source: 'motif-de-domaine' as const,
      nom: nomComplet.trim(),
      poste,
      justification: `le motif « ${m.libelle}@${domaine} »`,
    }
  })
}
