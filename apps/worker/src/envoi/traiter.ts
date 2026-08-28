/**
 * JOB-051 — le seul chemin par lequel quelque chose sort.
 *
 * `executer()` décide et envoie ; `reclamer()` empêche d'envoyer deux fois.
 * Un garde-fou qu'on peut oublier d'appeler ne garde rien : cette fonction
 * existe pour qu'il n'y ait pas deux façons de faire, et `index.ts` n'exporte
 * qu'elle. Le reste du module reste accessible depuis ses propres tests, pas
 * depuis le reste de l'application.
 *
 * L'ordre est celui de REQ-011, et il n'est pas négociable :
 *
 *   1. RÉCLAMER   — avant tout, et en base.
 *   2. DÉCIDER     — doublon, occupé, incertain, ou on y va.
 *   3. ENVOYER     — une seule fois.
 *   4. ENREGISTRER — l'issue et sa preuve, dans la même transaction.
 */

import type pg from 'pg'
import type { Canal } from '@job-seeker/profil'
import { executer, type Contexte, type Issue } from './envoyer.ts'
import { enregistrer } from './enregistrer.ts'
import { evaluerDossier } from './dossier.ts'
import {
  deciderReprise,
  reclamer,
  reprendre,
  republicationProbable,
  type Anterieure,
} from './idempotence.ts'
import { accepteEnvoiAutonome } from '@job-seeker/profil'

export type Travail = Contexte & {
  readonly profileId: string
  readonly opportuniteId: string
  readonly parQui: string
  readonly bailSecondes?: number
  /** Employeur et intitulé de l'offre visée — pour repérer une republication. */
  readonly cible: { employeurCanonique: string; titre: string }
}

export async function traiterEnvoi(db: pg.Client | pg.Pool, t: Travail): Promise<Issue> {
  const maintenant = t.maintenant ?? new Date()
  const etatDossier = evaluerDossier(t.dossier)

  // JOB-050 — une escalade passe AVANT tout le reste, y compris avant la
  // réclamation. Réclamer puis découvrir qu'on ne peut pas continuer laisserait
  // une ligne « en-cours » qu'un bail devra expirer, et qui serait relue comme
  // une interruption — alors que rien n'a été tenté.
  const escalade = t.dossier.escalades?.[0]
  if (escalade !== undefined) {
    const issue: Issue = {
      type: 'refuse',
      motif: `escalade-${escalade.motif}`,
      explication: `${escalade.constat} ${escalade.conduite}`,
    }
    await ecrire(db, t, etatDossier, issue)
    return issue
  }

  // Un canal qui ne s'envoie pas seul ne réclame rien : il n'y a pas d'effet de
  // bord à protéger, et poser une réclamation sur une préparation empêcherait
  // simplement de la refaire.
  if (!accepteEnvoiAutonome(t.canal)) {
    const issue = await executer(t)
    await ecrire(db, t, etatDossier, issue)
    return issue
  }

  const r = await reclamer(db, {
    profileId: t.profileId,
    opportuniteId: t.opportuniteId,
    canal: t.canal,
    parQui: t.parQui,
    bailSecondes: t.bailSecondes ?? 300,
  })

  if (!r.tenue) {
    const d = deciderReprise(r.etat, maintenant)
    // Un `switch` qui rend une issue pour chaque cas SAUF la reprise réussie,
    // laquelle laisse l'exécution continuer vers l'envoi.
    switch (d.action) {
      case 'doublon':
        return { type: 'refuse', motif: 'doublon', explication: d.explication }
      case 'occupe':
        return { type: 'refuse', motif: 'envoi-en-cours', explication: d.explication }
      case 'incertain':
        return { type: 'incertain', explication: d.explication }
      case 'envoyer': {
        // La ligne existe dans un état reprenable — 'prepare', ou 'refuse'
        // après un blocage PASSAGER comme un quota atteint. Sans cette reprise,
        // une candidature repoussée au lendemain ne repartait JAMAIS : la trace
        // de son propre refus lui barrait la route à chaque tour. Le défaut
        // était invisible en test unitaire, parce qu'il demande deux passages.
        //
        // La condition reste dans le `where` de `reprendre()` : décidée ici et
        // écrite sans condition, elle rouvrirait la course qu'on vient de
        // fermer.
        const repris = await reprendre(db, {
          opportuniteId: t.opportuniteId, canal: t.canal,
          parQui: t.parQui, bailSecondes: t.bailSecondes ?? 300,
        })
        if (!repris) {
          return {
            type: 'refuse',
            motif: 'reclamation-non-tenue',
            explication: 'Cette offre est en cours de traitement. Je reprends au prochain tour.',
          }
        }
        break
      }
    }
  }

  // Réclamation TENUE. À partir d'ici, toute sortie doit écrire une issue,
  // sans quoi la ligne reste « en-cours » jusqu'à l'expiration du bail — et
  // sera lue comme une interruption, ce qu'elle n'aura pas été.
  try {
    const republiee = republicationProbable(t.cible, await anterieures(db, t.profileId), maintenant)
    if (republiee !== null) {
      // Pas un refus définitif : recandidater au même poste six mois plus tard
      // est légitime, et nous ne pouvons pas distinguer une republication d'une
      // nouvelle campagne. Nous signalons ; la personne tranche.
      const issue: Issue = {
        type: 'refuse',
        motif: 'republication-probable',
        explication:
          `Vous avez déjà candidaté à « ${republiee.titre} » chez ce même employeur le ` +
          `${republiee.envoyeLe.toISOString().slice(0, 10)}. Cette annonce semble être la même, ` +
          'republiée. Dites-moi si je dois candidater quand même.',
      }
      await ecrire(db, t, etatDossier, issue)
      return issue
    }

    const issue = await executer(t)
    await ecrire(db, t, etatDossier, issue)
    return issue
  } catch (e) {
    // Une panne AVANT envoi remonte à la file, qui réessaiera — mais la
    // réclamation doit être RENDUE, sinon le réessai se heurtera à sa propre
    // trace et se croira en doublon.
    await db.query(
      `update public.dossiers set issue = 'refuse', issue_motif = 'panne-avant-envoi',
              reclame_le = null, reclame_par = null, bail_jusqu_a = null, updated_at = now()
        where opportunite_id = $1 and canal = $2 and issue = 'en-cours'`,
      [t.opportuniteId, t.canal],
    )
    throw e
  }
}

async function ecrire(
  db: pg.Client | pg.Pool,
  t: Travail,
  etat: ReturnType<typeof evaluerDossier>,
  issue: Issue,
): Promise<void> {
  await enregistrer(db, {
    profileId: t.profileId,
    opportuniteId: t.opportuniteId,
    canal: t.canal,
    dossier: t.dossier,
    etat,
    issue,
    destinationProvenance: t.destination?.provenance,
  })
}

/** Les envois déjà partis pour cette personne, pour repérer une republication. */
async function anterieures(db: pg.Client | pg.Pool, profileId: string): Promise<Anterieure[]> {
  const { rows } = await db.query<{ employeur: string; titre: string; envoye_le: Date }>(
    `select o.employeur_canonique as employeur, o.titre, d.updated_at as envoye_le
       from public.dossiers d
       join public.opportunites op on op.id = d.opportunite_id
       join public.offres o on o.id = op.offre_id
      where d.profile_id = $1 and d.issue = 'envoye'`,
    [profileId],
  )
  return rows.map((r) => ({
    employeurCanonique: r.employeur, titre: r.titre, envoyeLe: r.envoye_le,
  }))
}

export type { Canal }
