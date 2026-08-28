/**
 * JOB-065 — écrire les contacts, et fabriquer les « sources du serveur ».
 *
 * Cette dernière fonction est la charnière que F26 signalait : c'est elle qui
 * décide de ce que `verifierDestination()` acceptera. Tout ce qui n'y entre pas
 * est refusé par le chemin d'envoi, quoi qu'en dise le reste du code.
 */

import type pg from 'pg'
import type { SourcesServeur } from '../envoi/destination.ts'
import { utilisablesCommeDestination, type Certitude, type Contact, type SourceContact } from './certitude.ts'
import { retirerLesOpposes } from './opposition.ts'

/**
 * Enregistre les contacts identifiés pour une opportunité.
 *
 * `profile_id` n'est PAS un paramètre : il est lu depuis l'opportunité, comme
 * dans `escaladerEpuisement`. Après F27, rendre le désaccord inexprimable vaut
 * mieux que le contraindre.
 */
export async function deposer(
  db: pg.Client | pg.Pool,
  opportuniteId: string,
  contacts: readonly Contact[],
): Promise<number> {
  let ecrits = 0
  for (const c of contacts) {
    const { rowCount } = await db.query(
      `insert into public.contacts
         (profile_id, opportunite_id, nom, poste, adresse, certitude, source, justification)
       select op.profile_id, op.id, $2, $3, $4, $5::public.certitude_contact,
              $6::public.source_contact, $7
         from public.opportunites op
        where op.id = $1
       on conflict (opportunite_id, adresse) do nothing`,
      [opportuniteId, c.nom ?? null, c.poste ?? null, c.adresse.trim().toLowerCase(),
       c.certitude, c.source, c.justification],
    )
    ecrits += rowCount ?? 0
  }
  return ecrits
}

type Ligne = {
  adresse: string
  certitude: Certitude
  source: SourceContact
  nom: string | null
  poste: string | null
  justification: string
}

export async function lireContacts(
  db: pg.Client | pg.Pool,
  opportuniteId: string,
): Promise<readonly Contact[]> {
  const { rows } = await db.query<Ligne>(
    `select adresse, certitude, source, nom, poste, justification
       from public.contacts where opportunite_id = $1 and expire_le > now()
      order by case certitude when 'confirme' then 0 when 'probable' then 1 else 2 end`,
    [opportuniteId],
  )
  return rows.map((r) => ({
    adresse: r.adresse,
    certitude: r.certitude,
    source: r.source,
    nom: r.nom ?? undefined,
    poste: r.poste ?? undefined,
    justification: r.justification,
  }))
}

/**
 * Ce que le chemin d'envoi acceptera comme destination — et rien d'autre.
 *
 * Trois filtres, dans cet ordre, et chacun retire quelque chose que le
 * précédent laisse passer :
 *   1. l'expiration (dans la requête) : une adresse périmée n'est plus à nous ;
 *   2. l'OPPOSITION : quelqu'un a demandé qu'on le laisse tranquille ;
 *   3. la CERTITUDE : une devinette n'est jamais une destination automatique.
 *
 * Les domaines viennent du registre d'employeurs, jamais de l'annonce.
 */
export async function sourcesServeurPour(
  db: pg.Client | pg.Pool,
  opportuniteId: string,
): Promise<SourcesServeur> {
  const contacts = await retirerLesOpposes(db, await lireContacts(db, opportuniteId))

  const { rows } = await db.query<{ domaine: string }>(
    `select distinct lower(substring(e.site_carriere from '://(?:www\\.)?([^/:]+)')) as domaine
       from public.opportunites op
       join public.offres o on o.id = op.offre_id
       join worker.employeurs e on e.nom_canonique = o.employeur_canonique
      where op.id = $1 and e.site_carriere is not null`,
    [opportuniteId],
  )

  return {
    contacts: utilisablesCommeDestination(contacts),
    domainesEmployeur: rows.map((r) => r.domaine).filter((d): d is string => d !== null && d !== ''),
  }
}
