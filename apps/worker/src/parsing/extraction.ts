/**
 * JOB-031 — d'un CV lu à un profil PROPOSÉ.
 *
 * Le mot « proposé » porte toute la fonction. REQ-001 exige que la personne
 * voie chaque champ AVANT enregistrement, et rien ici n'écrit : l'extraction
 * rend un objet, et c'est l'écran de confirmation (JOB-032) qui décide de ce
 * qui est retenu. Un import raté ne peut donc pas laisser de profil à demi
 * construit — non par précaution, mais parce que cette couche ne sait pas
 * écrire.
 *
 * ── La règle de confiance, et pourquoi elle diffère de celle du score ──
 *
 * Comme dans `matching/score.ts`, chaque valeur extraite doit CITER le CV, et
 * la citation est vérifiée mot pour mot. Mais la réponse à une citation
 * introuvable est ici l'INVERSE.
 *
 *   Dans le score, une preuve invérifiable justifie une action automatique :
 *   on la SUPPRIME, parce qu'une explication inventée est plus convaincante
 *   qu'une vraie et que personne ne la relira.
 *
 *   Ici, un champ invérifiable est montré à un humain qui va le confirmer :
 *   on le GARDE et on le SIGNALE. Supprimer « Amina Diallo » parce que le
 *   modèle a normalisé une casse obligerait la personne à retaper son propre
 *   nom — on aurait remplacé un risque d'erreur par une corvée certaine.
 *
 * Même vérification, réponse opposée, parce que la conséquence diffère : d'un
 * côté une machine agit sans témoin, de l'autre quelqu'un regarde.
 */

import { CONSIGNE_FRONTIERE, citationPresente, encadrer, estSuspect } from '@job-seeker/llm-guard'
import type { Demande } from '@job-seeker/llm'

export type Confiance = 'sure' | 'a-verifier'

export type Champ<T> = {
  readonly valeur: T
  readonly confiance: Confiance
  /** Le passage du CV d'où vient la valeur. Vide quand le modèle n'a rien cité. */
  readonly citation: string
}

export type ExperienceProposee = {
  readonly employeur: Champ<string>
  readonly intitule: Champ<string>
  readonly debut: Champ<string>
  readonly fin: Champ<string | null>
  readonly resume: Champ<string>
}

export type Proposition = {
  readonly nomComplet: Champ<string>
  readonly titreAccroche: Champ<string>
  readonly email: Champ<string>
  readonly telephone: Champ<string>
  readonly localisation: Champ<string>
  readonly experiences: readonly ExperienceProposee[]
  readonly formations: readonly Champ<string>[]
  readonly competences: readonly Champ<string>[]
  readonly langues: readonly Champ<string>[]
  /** Combien de champs sont à vérifier — ce que l'écran met en avant. */
  readonly aVerifier: number
  readonly contenuSuspect: boolean
}

const SYSTEME = `Tu extrais les informations d'un CV pour les proposer à son
propriétaire, qui va les relire et les corriger avant tout enregistrement.

Règles absolues :
- Tu n'INVENTES rien. Un champ absent du CV se rend avec une valeur vide.
- Tu ne DÉDUIS rien. « Chargée de marketing digital » ne devient pas
  « Responsable marketing » ; une date « 2019 » ne devient pas « 2019-01-01 »
  si le CV ne le dit pas.
- Chaque valeur est accompagnée du passage EXACT du CV d'où elle vient, copié
  caractère pour caractère. Si tu ne peux pas copier un passage, laisse la
  citation vide plutôt que d'en composer une.
- Les dates sont rendues telles qu'écrites dans le CV.

${CONSIGNE_FRONTIERE}`

const SCHEMA = {
  nomComplet: { valeur: 'string', citation: 'string' },
  titreAccroche: { valeur: 'string', citation: 'string' },
  email: { valeur: 'string', citation: 'string' },
  telephone: { valeur: 'string', citation: 'string' },
  localisation: { valeur: 'string', citation: 'string' },
  experiences: [
    {
      employeur: { valeur: 'string', citation: 'string' },
      intitule: { valeur: 'string', citation: 'string' },
      debut: { valeur: 'string', citation: 'string' },
      fin: { valeur: 'string ou null si en cours', citation: 'string' },
      resume: { valeur: 'string', citation: 'string' },
    },
  ],
  formations: [{ valeur: 'string', citation: 'string' }],
  competences: [{ valeur: 'string', citation: 'string' }],
  langues: [{ valeur: 'string', citation: 'string' }],
}

/**
 * Le champ, et son niveau de confiance.
 *
 * `sure` demande DEUX choses, pas une : que le modèle ait cité, et que la
 * citation figure réellement dans le CV. Un champ sans citation est à vérifier
 * même s'il a l'air juste — c'est précisément le cas où l'on ne peut pas
 * savoir.
 */
export function champ<T>(valeur: T, citation: unknown, texteCv: string): Champ<T> {
  const c = typeof citation === 'string' ? citation.trim() : ''
  const verifiee = citationPresente(c, texteCv)
  return { valeur, confiance: verifiee ? 'sure' : 'a-verifier', citation: c }
}

function texte(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function lireChamp(brut: unknown, texteCv: string): Champ<string> {
  const o = typeof brut === 'object' && brut !== null ? (brut as Record<string, unknown>) : {}
  return champ(texte(o['valeur']), o['citation'], texteCv)
}

function lireListe(brut: unknown, texteCv: string): readonly Champ<string>[] {
  if (!Array.isArray(brut)) return []
  return brut.map((e) => lireChamp(e, texteCv)).filter((c) => c.valeur !== '')
}

function lireExperiences(brut: unknown, texteCv: string): readonly ExperienceProposee[] {
  if (!Array.isArray(brut)) return []
  return brut
    .map((e): ExperienceProposee => {
      const o = typeof e === 'object' && e !== null ? (e as Record<string, unknown>) : {}
      const fin = lireChamp(o['fin'], texteCv)
      return {
        employeur: lireChamp(o['employeur'], texteCv),
        intitule: lireChamp(o['intitule'], texteCv),
        debut: lireChamp(o['debut'], texteCv),
        // Une fin vide veut dire « en cours ». C'est une information, pas un
        // trou : la confiance de la citation est conservée telle quelle.
        fin: { ...fin, valeur: fin.valeur === '' ? null : fin.valeur },
        resume: lireChamp(o['resume'], texteCv),
      }
    })
    .filter((x) => x.employeur.valeur !== '' || x.intitule.valeur !== '')
}

function compterAVerifier(p: Omit<Proposition, 'aVerifier' | 'contenuSuspect'>): number {
  const simples = [p.nomComplet, p.titreAccroche, p.email, p.telephone, p.localisation]
  const listes = [...p.formations, ...p.competences, ...p.langues]
  const exp = p.experiences.flatMap((e) => [e.employeur, e.intitule, e.debut, e.fin, e.resume])
  return [...simples, ...listes, ...exp].filter(
    (c) => c.confiance === 'a-verifier' && c.valeur !== '' && c.valeur !== null,
  ).length
}

export type Completer = (d: Demande) => Promise<{ texte: string; refus: boolean }>

export class ExtractionRefusee extends Error {}

export async function extraire(
  texteCv: string,
  completer: Completer,
  options: { imputableA: string; journal?: { log: (n: string, m: string, d?: unknown) => void } },
): Promise<Proposition> {
  // Un CV est un document fourni par l'utilisateur, mais pas forcément ÉCRIT
  // par lui : un modèle de CV téléchargé, un fichier reçu d'un tiers. On le
  // traite donc comme du texte étranger, au même titre qu'une annonce.
  const encadre = encadrer(texteCv, 'CV')
  const suspect = estSuspect(encadre)
  if (suspect) {
    // Le journal dit COMBIEN, jamais QUOI : recopier la charge dans un journal
    // la déplace simplement vers un autre endroit qui la lira un jour.
    options.journal?.log('warn', 'contenu de CV suspect', { count: encadre.signaux.length })
  }

  const reponse = await completer({
    systeme: SYSTEME,
    messages: [
      {
        role: 'user',
        content: `CV à lire :\n\n${encadre.bloc}\n\nRéponds UNIQUEMENT par un objet JSON conforme à ce schéma, sans texte autour :\n${JSON.stringify(SCHEMA)}`,
      },
    ],
    maxTokens: 4000,
    imputableA: options.imputableA,
    effort: 'medium',
  })

  if (reponse.refus) {
    // Rendre une proposition vide ferait passer un refus pour un CV illisible,
    // et REQ-003 l'interdit : un échec ne se présente jamais comme une absence.
    throw new ExtractionRefusee('le modele a decline la lecture de ce document')
  }

  const brut = extraireJson(reponse.texte)
  if (brut === null) throw new ExtractionRefusee('reponse du modele illisible')

  const noyau = {
    nomComplet: lireChamp(brut['nomComplet'], texteCv),
    titreAccroche: lireChamp(brut['titreAccroche'], texteCv),
    email: lireChamp(brut['email'], texteCv),
    telephone: lireChamp(brut['telephone'], texteCv),
    localisation: lireChamp(brut['localisation'], texteCv),
    experiences: lireExperiences(brut['experiences'], texteCv),
    formations: lireListe(brut['formations'], texteCv),
    competences: lireListe(brut['competences'], texteCv),
    langues: lireListe(brut['langues'], texteCv),
  }

  return { ...noyau, aVerifier: compterAVerifier(noyau), contenuSuspect: suspect }
}

function extraireJson(t: string): Record<string, unknown> | null {
  const debut = t.indexOf('{')
  const fin = t.lastIndexOf('}')
  if (debut === -1 || fin <= debut) return null
  try {
    const v: unknown = JSON.parse(t.slice(debut, fin + 1))
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}
