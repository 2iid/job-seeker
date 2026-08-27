/**
 * REQ-011 — le dossier complet, et ce qui décide qu'il est PRÊT.
 *
 * ADR-0003 a fait de cet objet le livrable principal du produit sur les canaux
 * ATS : « le produit dit ce qu'il a préparé plutôt que ce qu'il a envoyé ».
 * Un dossier incomplet présenté comme prêt est donc la pire régression
 * possible — quelqu'un cliquerait « envoyer » sur une lettre tronquée.
 */

import type { Canal } from '@job-seeker/profil'

export type Piece = {
  readonly nature: 'cv' | 'lettre' | 'reponse-screening'
  readonly intitule: string
  readonly contenu: string
  /**
   * Vrai quand la pièce a passé sa vérification de sortie : contrainte tenue
   * pour le CV (REQ-007), organisations citées vérifiées pour la lettre
   * (JOB-044). Une pièce non relue ne rend pas un dossier prêt.
   */
  readonly relue: boolean
}

export type Dossier = {
  readonly opportuniteId: string
  readonly canal: Canal
  readonly pieces: readonly Piece[]
  /** Les questions de screening restées sans réponse fiable. */
  readonly questionsSansReponse: readonly string[]
}

export type EtatDossier =
  | { readonly pret: true }
  | { readonly pret: false; readonly manques: readonly string[] }

/** Ce qu'un dossier doit contenir pour qu'on puisse en parler comme d'un dossier. */
const REQUISES: readonly Piece['nature'][] = ['cv', 'lettre']

export function evaluerDossier(d: Dossier): EtatDossier {
  const manques: string[] = []

  for (const nature of REQUISES) {
    const p = d.pieces.find((x) => x.nature === nature)
    if (p === undefined) manques.push(nature === 'cv' ? 'le CV adapté' : 'la lettre')
    else if (p.contenu.trim() === '') manques.push(nature === 'cv' ? 'le CV adapté' : 'la lettre')
  }

  // Une pièce présente mais NON RELUE compte comme un manque, pas comme un
  // détail de qualité. C'est la seule lecture compatible avec REQ-007 : le
  // produit n'a pas le droit de proposer d'envoyer un document dont il n'a pas
  // vérifié qu'il n'invente rien.
  for (const p of d.pieces) {
    if (!p.relue) manques.push(`${p.intitule} — pas encore relue`)
  }

  // Une question de screening sans réponse ne bloque pas silencieusement : elle
  // est NOMMÉE. Le dossier n'est pas prêt, et la personne sait quoi faire.
  for (const q of d.questionsSansReponse) manques.push(`une réponse à « ${q} »`)

  return manques.length === 0 ? { pret: true } : { pret: false, manques }
}

/**
 * Ce que le produit ANNONCE quand il s'arrête sur un canal ATS.
 *
 * « Ce qu'il a préparé plutôt que ce qu'il a envoyé » : la phrase est de
 * l'ADR, et elle interdit la formulation habituelle des agents — « candidature
 * traitée » — qui laisse croire qu'une chose est partie.
 */
export function annoncerPrepare(d: Dossier, etat: EtatDossier): string {
  if (!etat.pret) {
    return `Je n’ai pas fini : il manque ${listeFr(etat.manques)}.`
  }
  const natures = d.pieces.map((p) => p.intitule)
  return (
    `Votre dossier est prêt : ${listeFr(natures)}. ` +
    'Relisez, puis envoyez — le dernier geste est à vous.'
  )
}

function listeFr(xs: readonly string[]): string {
  if (xs.length === 0) return 'rien'
  if (xs.length === 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1] ?? ''}`
}
