import { CONSIGNE_FRONTIERE, citationPresente, encadrer, estSuspect } from '@job-seeker/llm-guard'
import type { Journal } from '@job-seeker/observability'
import type { Demande } from '@job-seeker/llm'
import { evaluerRedhibitoires, peutPostulerSeule, type Criteres, type OffreAEvaluer, type Redhibitoire } from './redhibitoires.ts'

/**
 * REQ-005 — le score, et ses preuves.
 *
 * Deux garanties que ce fichier existe pour tenir :
 *
 *  1. **Chaque preuve cite le texte de l'offre**, et la citation est VÉRIFIÉE :
 *     si elle ne s'y trouve pas, elle est écartée. Un modèle qui invente une
 *     citation produit une explication plus convaincante qu'une vraie — c'est
 *     exactement ce qu'il faut refuser, parce que l'utilisateur ne peut pas
 *     faire la différence.
 *
 *  2. **Les rédhibitoires viennent du code**, pas du modèle. Le modèle explique
 *     et cite ; le code décide de ce qui bloque.
 */

export type Preuve = {
  readonly libelle: string
  /** Extrait exact de l'offre. Vérifié — jamais cru sur parole. */
  readonly citation: string
}

export type Score = {
  readonly valeur: number
  readonly correspondances: readonly Preuve[]
  readonly manques: readonly Preuve[]
  readonly redhibitoires: readonly Redhibitoire[]
  readonly peutPostulerSeule: boolean
  /** Citations rejetées parce qu'introuvables dans l'offre. Comptées, pas cachées. */
  readonly citationsRejetees: number
  readonly contenuSuspect: boolean
}

export const SCHEMA_SORTIE = {
  type: 'object',
  additionalProperties: false,
  required: ['valeur', 'correspondances', 'manques'],
  properties: {
    valeur: { type: 'integer', minimum: 0, maximum: 100 },
    correspondances: {
      type: 'array', maxItems: 6,
      items: {
        type: 'object', additionalProperties: false, required: ['libelle', 'citation'],
        properties: {
          libelle: { type: 'string', maxLength: 120 },
          citation: { type: 'string', maxLength: 300 },
        },
      },
    },
    manques: {
      type: 'array', maxItems: 4,
      items: {
        type: 'object', additionalProperties: false, required: ['libelle', 'citation'],
        properties: {
          libelle: { type: 'string', maxLength: 120 },
          citation: { type: 'string', maxLength: 300 },
        },
      },
    },
  },
} as const

const SYSTEME = `Tu évalues la correspondance entre un profil et une offre d'emploi, pour aider une personne à décider si elle candidate.

${CONSIGNE_FRONTIERE}

Règles de ton évaluation :
- Chaque correspondance et chaque manque DOIT porter une citation EXACTE et VERBATIM du texte de l'offre. Recopie les mots tels qu'ils sont écrits, sans les reformuler.
- Si tu ne peux pas citer l'offre pour un point, ne le mentionne pas.
- Le score va de 0 à 100 et reflète la probabilité que cette personne soit retenue en entretien.
- Tu n'évalues PAS l'autorisation de travail, la zone géographique ni le mode de présence : ils sont décidés ailleurs.
- Écris en français, sobrement, sans flatterie.`

/**
 * Garde une preuve seulement si sa citation figure RÉELLEMENT dans l'offre.
 *
 * Sans cette vérification, une explication inventée serait indistinguable
 * d'une vraie pour l'utilisateur — et plus convaincante, puisque le modèle
 * écrirait la citation qui justifie le mieux son score.
 */
export function verifierCitations(
  preuves: readonly Preuve[],
  texteOffre: string,
): { gardees: readonly Preuve[]; rejetees: number } {
  const gardees = preuves.filter((p) => citationPresente(p.citation, texteOffre))
  return { gardees, rejetees: preuves.length - gardees.length }
}

export type Completer = (d: Demande) => Promise<{ texte: string; refus: boolean }>

export async function evaluer(
  offre: OffreAEvaluer & { readonly texteComplet: string },
  profil: string,
  criteres: Criteres,
  completer: Completer,
  options: { imputableA: string; journal?: Journal },
): Promise<Score> {
  // Les rédhibitoires D'ABORD : s'ils bloquent, on peut vouloir économiser
  // l'appel. Mais on l'exécute quand même, parce que REQ-005 exige d'expliquer
  // POURQUOI une offre a été écartée — un rejet sans explication est un rejet
  // que l'utilisateur ne peut pas corriger.
  const redhibitoires = evaluerRedhibitoires(offre, criteres)

  const encadre = encadrer(offre.texteComplet, "annonce d'emploi")
  if (estSuspect(encadre)) {
    options.journal?.log('warn', 'contenu d offre suspect', {
      source: offre.employeurCanonique,
      count: encadre.signaux.length,
    })
  }

  const reponse = await completer({
    systeme: SYSTEME,
    messages: [{
      role: 'user',
      content: `Profil du candidat :\n${profil}\n\nOffre à évaluer :\n\n${encadre.bloc}\n\nRéponds UNIQUEMENT par un objet JSON conforme à ce schéma, sans texte autour :\n${JSON.stringify(SCHEMA_SORTIE)}`,
    }],
    maxTokens: 2000,
    imputableA: options.imputableA,
    effort: 'medium',
  })

  if (reponse.refus) {
    return {
      valeur: 0, correspondances: [], manques: [], redhibitoires,
      peutPostulerSeule: false, citationsRejetees: 0, contenuSuspect: estSuspect(encadre),
    }
  }

  const brut = extraireJson(reponse.texte)
  const correspondances = verifierCitations(lirePreuves(brut?.['correspondances']), offre.texteComplet)
  const manques = verifierCitations(lirePreuves(brut?.['manques']), offre.texteComplet)

  const valeurBrute = typeof brut?.['valeur'] === 'number' ? brut['valeur'] : 0
  const valeur = Math.max(0, Math.min(100, Math.round(valeurBrute)))

  return {
    valeur,
    correspondances: correspondances.gardees,
    manques: manques.gardees,
    redhibitoires,
    peutPostulerSeule: peutPostulerSeule(redhibitoires),
    citationsRejetees: correspondances.rejetees + manques.rejetees,
    contenuSuspect: estSuspect(encadre),
  }
}

/** Le modèle peut encadrer son JSON de texte : on prend le premier objet. */
function extraireJson(texte: string): Record<string, unknown> | null {
  const debut = texte.indexOf('{')
  const fin = texte.lastIndexOf('}')
  if (debut === -1 || fin <= debut) return null
  try {
    const v: unknown = JSON.parse(texte.slice(debut, fin + 1))
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function lirePreuves(v: unknown): readonly Preuve[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((x): Preuve[] => {
    if (typeof x !== 'object' || x === null) return []
    const o = x as Record<string, unknown>
    const libelle = typeof o['libelle'] === 'string' ? o['libelle'] : ''
    const citation = typeof o['citation'] === 'string' ? o['citation'] : ''
    return libelle === '' ? [] : [{ libelle, citation }]
  })
}
