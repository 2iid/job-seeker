/**
 * REQ-011 / ADR-0003 — les deux chemins, et un seul point de sortie.
 *
 * Sur un canal ATS : préparer, et s'arrêter. Sur le courriel : envoyer, sous
 * mandat. Les deux passent par ici, pour que la décision de ne PAS envoyer soit
 * un résultat de première classe et non un chemin d'erreur.
 *
 * ── La distinction qui structure ce fichier : quel échec a le droit d'être
 *    RÉESSAYÉ ──
 *
 * La file réessaie avec retrait progressif borné. C'est correct pour une panne
 * réseau. Ce n'est PAS correct pour un envoi dont on ignore s'il est parti :
 * réessayer enverrait une deuxième candidature au même recruteur, et cela ne se
 * reprend pas. Un échec ambigu est donc terminal ET signalé, jamais réessayé —
 * la duplication est plus coûteuse que l'absence.
 */

import {
  peutEnvoyer,
  accepteEnvoiAutonome,
  type Canal,
  type DecisionEnvoi,
  type EtatEnvoi,
} from '@job-seeker/profil'
import { adresseDe, estVerifiee, type DestinationVerifiee } from './destination.ts'
import { annoncerPrepare, evaluerDossier, type Dossier } from './dossier.ts'

export type Confirmation = {
  /** Ce que le destinataire a répondu : identifiant de message, accusé, référence. */
  readonly reference: string
  readonly recuLe: string
}

export type Transport = (
  destination: DestinationVerifiee,
  dossier: Dossier,
) => Promise<Confirmation>

export type Issue =
  /** Canal ATS, ou cadran en dessous d'« agir seule » : le dossier attend. */
  | { readonly type: 'prepare'; readonly annonce: string; readonly pret: boolean }
  /**
   * Parti, avec la preuve de ce que le destinataire a répondu — ET le contexte
   * d'autorisation du moment. Le cran et le mandat sont portés par l'issue
   * plutôt que relus plus tard : les relire au moment d'écrire le reçu
   * donnerait l'état d'AUJOURD'HUI, qui n'explique rien de ce qui s'est passé.
   */
  | {
      readonly type: 'envoye'
      readonly confirmation: Confirmation
      readonly adresse: string
      readonly cranAuMoment: string
      readonly mandatId: string | null
    }
  /** Refusé par nos propres règles. Terminal : réessayer ne changera rien. */
  | { readonly type: 'refuse'; readonly motif: string; readonly explication: string }
  /**
   * On ne sait pas si c'est parti. Terminal AUSSI, et escaladé.
   * Ne jamais réessayer : voir l'en-tête.
   */
  | { readonly type: 'incertain'; readonly explication: string }

/** Levée par un transport pour une panne survenue AVANT tout envoi. */
export class PanneAvantEnvoi extends Error {
  readonly reessayable = true
  constructor(message: string) {
    super(message)
    this.name = 'PanneAvantEnvoi'
  }
}

/** Levée quand le message a PEUT-ÊTRE été remis. Jamais réessayée. */
export class IssueIncertaine extends Error {
  readonly reessayable = false
  constructor(message: string) {
    super(message)
    this.name = 'IssueIncertaine'
  }
}

export type Contexte = {
  readonly etat: EtatEnvoi
  readonly canal: Canal
  readonly dossier: Dossier
  /**
   * Absente sur un canal qui ne s'envoie pas seul — et le type le dit :
   * il n'existe aucun moyen de fournir une destination non vérifiée.
   */
  // `| undefined` explicite : avec `exactOptionalPropertyTypes`, omettre la clé
  // et l'écrire `undefined` sont deux choses différentes. Le code traite les
  // deux pareil, le type doit le dire.
  readonly destination?: DestinationVerifiee | undefined
  readonly transport: Transport
  readonly maintenant?: Date | undefined
}

export async function executer(c: Contexte): Promise<Issue> {
  const etatDossier = evaluerDossier(c.dossier)
  const decision: DecisionEnvoi = peutEnvoyer(c.etat, c.canal, c.maintenant ?? new Date())

  // ── Chemin « préparer » ──
  //
  // Il vient EN PREMIER, et c'est une décision de conception. Traiter la
  // préparation comme l'échec de l'envoi produirait le vocabulaire que
  // l'ADR-0003 interdit : « candidature non envoyée » là où la vérité est
  // « votre dossier est prêt ». Sur la majorité des canaux, c'est le chemin
  // NOMINAL — pas une exception.
  if (!decision.envoyer) {
    if (decision.motif === 'canal-sans-envoi-autonome' || decision.motif === 'cran-insuffisant') {
      return {
        type: 'prepare',
        annonce: `${annoncerPrepare(c.dossier, etatDossier)} ${decision.explication}`.trim(),
        pret: etatDossier.pret,
      }
    }
    return { type: 'refuse', motif: decision.motif, explication: decision.explication }
  }

  // ── Chemin « envoyer » ──

  // Ceinture ET bretelles. Le type interdit déjà d'appeler `executer` avec un
  // canal non autonome muni d'une destination, et `peutEnvoyer` l'a refusé
  // ci-dessus. On le revérifie quand même : cette ligne est ce qui reste si
  // quelqu'un réordonne les contrôles au-dessus, et son coût est nul.
  if (!accepteEnvoiAutonome(c.canal)) {
    return {
      type: 'refuse',
      motif: 'canal-sans-envoi-autonome',
      explication: 'Ce canal ne s’envoie pas seul.',
    }
  }

  // Un dossier incomplet ne part pas. L'ordre compte : on refuse AVANT de
  // toucher au transport, pour qu'aucun envoi partiel ne soit possible.
  if (!etatDossier.pret) {
    return {
      type: 'refuse',
      motif: 'dossier-incomplet',
      explication: annoncerPrepare(c.dossier, etatDossier),
    }
  }

  // La marque de vérification est revérifiée À L'EXÉCUTION et pas seulement au
  // compilateur. Un `as unknown as DestinationVerifiee` suffirait sinon à faire
  // passer une adresse tirée du texte d'une annonce — et c'est exactement la
  // ligne qu'écrit quelqu'un de pressé.
  if (c.destination === undefined || !estVerifiee(c.destination)) {
    return {
      type: 'refuse',
      motif: 'destination-non-verifiee',
      explication:
        'Je n’ai pas de destinataire que j’aie vérifié moi-même pour cette offre. Je n’envoie pas.',
    }
  }

  try {
    const confirmation = await c.transport(c.destination, c.dossier)
    return {
      type: 'envoye',
      confirmation,
      adresse: adresseDe(c.destination),
      cranAuMoment: c.etat.cranDuCanal,
      mandatId: decision.mandat.id ?? null,
    }
  } catch (e) {
    if (e instanceof PanneAvantEnvoi) {
      // Rien n'est parti : la file peut réessayer. On relaie, on n'avale pas.
      throw e
    }
    // Tout le reste est traité comme AMBIGU, y compris une erreur inconnue.
    // Le défaut penche du côté qui ne duplique pas : présumer « rien n'est
    // parti » sur une erreur qu'on n'a pas prévue est le raisonnement qui
    // envoie deux fois.
    return {
      type: 'incertain',
      explication:
        'Je ne sais pas si ce message est parti. Je ne réessaie pas : deux candidatures au même ' +
        'recruteur ne se reprennent pas. Vérifiez, puis dites-moi quoi faire.',
    }
  }
}
