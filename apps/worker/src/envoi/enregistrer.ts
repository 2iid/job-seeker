/**
 * JOB-049 — écrire ce qui s'est passé, et le rendre lisible sur le tableau.
 *
 * ── La correspondance issue → statut est une décision, pas une conversion ──
 *
 * Chaque ligne ci-dessous répond à « qu'est-ce que la personne doit faire
 * maintenant ? ». C'est le seul critère utile : un statut qui décrit l'état
 * interne du worker (« traité », « terminé ») n'aide personne à agir.
 */

import type pg from 'pg'
import type { Issue } from './envoyer.ts'
import type { Dossier, EtatDossier } from './dossier.ts'
import type { Canal } from '@job-seeker/profil'
import { depuisDossier, ecrireRecu } from '../receipts/recu.ts'

export type Statut =
  | 'en-file'
  | 'prete-a-envoyer'
  | 'envoyee'
  | 'escalade'
  | 'incertaine'

/** Les refus qui se résolvent tout seuls : il n'y a rien à faire qu'attendre. */
const PASSAGERS = new Set([
  'quota-atteint',
  'hors-plage',
  'arret-urgence',
  'parcours-en-cours',
  'suppression-en-cours',
])

export function statutPour(issue: Issue): Statut {
  switch (issue.type) {
    case 'envoye':
      return 'envoyee'
    case 'incertain':
      // Surtout PAS 'escalade' : une escalade dit « je n'ai pas pu ». Ici la
      // phrase est « je ne sais pas », et elle appelle une vérification chez le
      // destinataire, pas une reprise de notre côté.
      return 'incertaine'
    case 'prepare':
      // Un dossier incomplet reste « en file » : le produit a encore du travail.
      // Le dire « prêt » serait le mensonge le plus coûteux du système, puisque
      // quelqu'un cliquerait « envoyer » dessus.
      return issue.pret ? 'prete-a-envoyer' : 'en-file'
    case 'refuse':
      // Un refus passager n'est pas une escalade. Envoyer quelqu'un vérifier
      // parce que son quota du jour est atteint use la seule chose qu'une
      // escalade possède : le fait qu'elle soit rare.
      return PASSAGERS.has(issue.motif) ? 'en-file' : 'escalade'
  }
}

export type Enregistrement = {
  readonly profileId: string
  readonly opportuniteId: string
  readonly canal: Canal
  readonly dossier: Dossier
  readonly etat: EtatDossier
  readonly issue: Issue
  /** D'où venait la destination. Consignée, pas seulement décidée. */
  readonly destinationProvenance?: 'contact-enregistre' | 'domaine-employeur' | undefined
}

/**
 * Écrit le dossier et le statut EN UNE SEULE transaction.
 *
 * Séparer les deux laisserait une fenêtre où l'opportunité est « envoyée » sans
 * dossier, ou l'inverse. Sur un incident, c'est précisément la ligne qu'on
 * regarde pour savoir ce qui est parti.
 */
export async function enregistrer(db: pg.Client | pg.Pool, e: Enregistrement): Promise<void> {
  const motif = e.issue.type === 'refuse' ? e.issue.motif : null
  // Obtenue UNE fois, jamais redonnée : le destinataire ne la répétera pas.
  const conf = e.issue.type === 'envoye' ? e.issue.confirmation : null
  const adresse = e.issue.type === 'envoye' ? e.issue.adresse : null
  const provenance = e.issue.type === 'envoye' ? e.destinationProvenance ?? null : null
  await db.query('begin')
  try {
    await db.query(
      `insert into public.dossiers
         (profile_id, opportunite_id, canal, pieces, manques, pret, issue, issue_motif,
          confirmation_reference, confirmation_recue_le, destination_adresse, destination_provenance)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12)
       on conflict (opportunite_id, canal) do update
         set pieces = excluded.pieces, manques = excluded.manques, pret = excluded.pret,
             issue = excluded.issue, issue_motif = excluded.issue_motif,
             -- coalesce et non excluded : une préparation qui suit un envoi
             -- ne doit pas effacer la preuve de cet envoi.
             confirmation_reference = coalesce(excluded.confirmation_reference, public.dossiers.confirmation_reference),
             confirmation_recue_le = coalesce(excluded.confirmation_recue_le, public.dossiers.confirmation_recue_le),
             destination_adresse = coalesce(excluded.destination_adresse, public.dossiers.destination_adresse),
             destination_provenance = coalesce(excluded.destination_provenance, public.dossiers.destination_provenance),
             -- La réclamation est RENDUE en même temps que l'issue est écrite.
             -- Laisser un bail sur une ligne terminée la ferait relire plus tard
             -- comme une interruption, ce qu'elle n'a pas été.
             reclame_le = null, reclame_par = null, bail_jusqu_a = null,
             updated_at = now()`,
      [
        e.profileId, e.opportuniteId, e.canal,
        JSON.stringify(e.dossier.pieces),
        JSON.stringify(e.etat.pret ? [] : e.etat.manques),
        e.etat.pret, e.issue.type, motif,
        conf?.reference ?? null, conf?.recuLe ?? null, adresse, provenance,
      ],
    )
    await db.query('update public.opportunites set statut = $2 where id = $1', [
      e.opportuniteId, statutPour(e.issue),
    ])

    // REQ-013 — le reçu, DANS la même transaction que l'état de l'envoi.
    //
    // Les écrire séparément laisserait une fenêtre où le produit affirme avoir
    // envoyé sans pouvoir dire quoi. C'est précisément le « trou » que
    // l'exigence interdit, et l'écrire après coup le rendrait possible à chaque
    // exécution plutôt qu'une fois sur mille.
    //
    // Seul un envoi RÉEL produit un reçu. Une préparation n'a rien fait sortir
    // et n'a rien à prouver ; lui en donner un viderait le mot de son sens.
    if (e.issue.type === 'envoye') {
      await ecrireRecu(
        db,
        depuisDossier(e.dossier, {
          profileId: e.profileId,
          opportuniteId: e.opportuniteId,
          cranAuMoment: e.issue.cranAuMoment,
          mandatId: e.issue.mandatId,
          resultat: 'envoye',
        }),
      )
    }

    await db.query('commit')
  } catch (err) {
    await db.query('rollback')
    throw err
  }
}
