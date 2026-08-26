/**
 * JOB-040 — engendrer un CV adapté, et le refuser s'il déborde.
 *
 * L'ordre des opérations est la fonctionnalité :
 *
 *   1. le modèle propose une sélection et des reformulations ;
 *   2. `verifierContrainte` la confronte au profil canonique ;
 *   3. si elle déborde, on RECOMMENCE en nommant ce qui a débordé ;
 *   4. au bout de deux tentatives, on RENONCE et on le dit.
 *
 * Renoncer est une issue prévue, pas un échec à cacher. Rendre quand même un
 * CV « presque bon » reviendrait à faire porter la vérification à la personne,
 * alors que c'est exactement ce que ce module existe pour lui épargner — et
 * elle, elle ne relira pas la trente-deuxième candidature.
 *
 * La reprise NOMME ce qui a débordé plutôt que de répéter la consigne. Redire
 * « n'invente pas » à un modèle qui vient d'inventer ne l'informe de rien ;
 * lui dire « le chiffre 40 n'est nulle part dans le profil » lui donne de quoi
 * corriger.
 */

import { CONSIGNE_FRONTIERE, encadrer, estSuspect } from '@job-seeker/llm-guard'
import type { Demande } from '@job-seeker/llm'
import { estUtilisable, expliquer, verifierContrainte, type CvAdapte, type Violation } from './contrainte.ts'
import type { ProfilCanonique } from './profil-canonique.ts'

const SYSTEME = `Tu adaptes un CV existant à une offre précise.

Tu as le droit de :
- SÉLECTIONNER les expériences et formations les plus pertinentes ;
- les ORDONNER pour mettre en avant ce qui parle à l'offre ;
- REFORMULER la description d'une expérience pour l'offre visée.

Tu n'as le droit, en aucun cas, de :
- AJOUTER une expérience, une formation ou une compétence absente du profil ;
- MODIFIER une date, un employeur, un intitulé de poste ou un établissement ;
- INTRODUIRE un chiffre qui n'est pas déjà dans la description d'origine.

Ce dernier point est le plus important. « J'ai accompagné la croissance de
l'équipe » ne devient jamais « croissance de l'équipe de 40 % ». La seconde
phrase est meilleure, et c'est un chiffre que la personne devra justifier en
entretien sans savoir d'où il sort.

Tu désignes chaque expérience et chaque formation par son identifiant.

${CONSIGNE_FRONTIERE}`

const SCHEMA = {
  titreAccroche: 'string — une ligne, tirée de ce que la personne fait déjà',
  experiences: [{ id: "l'identifiant de l'expérience", description: 'la reformulation' }],
  formationIds: ['identifiants des formations retenues'],
  competences: ['compétences retenues, telles quelles'],
}

export type Completer = (d: Demande) => Promise<{ texte: string; refus: boolean }>

export type Journal = { log: (n: string, m: string, d?: unknown) => void }

export type ResultatCv =
  | { readonly ok: true; readonly cv: CvAdapte; readonly tentatives: number }
  | {
      readonly ok: false
      readonly motif: 'contrainte' | 'refus-modele' | 'illisible'
      readonly violations: readonly Violation[]
      readonly explications: readonly string[]
      readonly tentatives: number
    }

/** Deux tentatives. Une troisième coûterait plus qu'elle ne rapporte. */
const TENTATIVES_MAX = 2

export async function engendrerCv(
  profil: ProfilCanonique,
  texteOffre: string,
  completer: Completer,
  options: { imputableA: string; journal?: Journal; autoriserAppel?: () => boolean },
): Promise<ResultatCv> {
  // Le texte de l'offre vient d'un tiers : il passe par la frontière avant
  // d'atteindre le modèle, comme partout ailleurs.
  const encadre = encadrer(texteOffre, "annonce d'emploi")
  if (estSuspect(encadre)) {
    options.journal?.log('warn', 'contenu d offre suspect', { count: encadre.signaux.length })
  }

  let derniereViolations: readonly Violation[] = []

  for (let tentative = 1; tentative <= TENTATIVES_MAX; tentative += 1) {
    // Le plafond de coût est consulté AVANT l'appel, jamais après : après, la
    // dépense est faite.
    if (options.autoriserAppel?.() === false) {
      return {
        ok: false, motif: 'contrainte', violations: derniereViolations,
        explications: ['Le plafond de dépense de cette candidature est atteint.'],
        tentatives: tentative - 1,
      }
    }

    const reprise =
      derniereViolations.length === 0
        ? ''
        : `\n\nTa proposition précédente a été refusée pour ces raisons précises :\n` +
          derniereViolations.map((v) => `- ${expliquer(v)}`).join('\n') +
          `\nCorrige-les. Ne change rien d'autre.`

    const reponse = await completer({
      systeme: SYSTEME,
      messages: [
        {
          role: 'user',
          content:
            `Profil canonique (JSON) :\n${JSON.stringify(profil)}\n\n` +
            `Offre visée :\n\n${encadre.bloc}\n\n` +
            `Réponds UNIQUEMENT par un objet JSON conforme à ce schéma :\n${JSON.stringify(SCHEMA)}` +
            reprise,
        },
      ],
      maxTokens: 4000,
      imputableA: options.imputableA,
      effort: 'medium',
    })

    if (reponse.refus) {
      return {
        ok: false, motif: 'refus-modele', violations: [],
        explications: ['Le modèle a décliné cette adaptation.'], tentatives: tentative,
      }
    }

    const cv = lireCv(reponse.texte)
    if (cv === null) {
      derniereViolations = []
      if (tentative === TENTATIVES_MAX) {
        return {
          ok: false, motif: 'illisible', violations: [],
          explications: ['La réponse du modèle n’a pas pu être lue.'], tentatives: tentative,
        }
      }
      continue
    }

    const violations = verifierContrainte(cv, profil)
    if (estUtilisable(violations)) return { ok: true, cv, tentatives: tentative }

    // On journalise le TYPE des violations, jamais leur contenu : une
    // description de CV recopiée dans un journal est de la donnée personnelle
    // déplacée vers un endroit qui la lira un jour.
    options.journal?.log('warn', 'cv adapte hors contrainte', {
      tentative,
      types: violations.map((v) => v.type),
    })
    derniereViolations = violations
  }

  return {
    ok: false,
    motif: 'contrainte',
    violations: derniereViolations,
    explications: derniereViolations.map(expliquer),
    tentatives: TENTATIVES_MAX,
  }
}

function lireCv(texte: string): CvAdapte | null {
  const debut = texte.indexOf('{')
  const fin = texte.lastIndexOf('}')
  if (debut === -1 || fin <= debut) return null
  try {
    const v = JSON.parse(texte.slice(debut, fin + 1)) as Record<string, unknown>
    const experiences = Array.isArray(v['experiences'])
      ? v['experiences'].flatMap((e) => {
          const o = e as Record<string, unknown>
          return typeof o?.['id'] === 'string' && typeof o?.['description'] === 'string'
            ? [{ id: o['id'], description: o['description'] }]
            : []
        })
      : []
    return {
      titreAccroche: typeof v['titreAccroche'] === 'string' ? v['titreAccroche'] : '',
      experiences,
      formationIds: Array.isArray(v['formationIds'])
        ? v['formationIds'].filter((x): x is string => typeof x === 'string')
        : [],
      competences: Array.isArray(v['competences'])
        ? v['competences'].filter((x): x is string => typeof x === 'string')
        : [],
    }
  } catch {
    return null
  }
}
