/**
 * JOB-065 / OBL-3 — le droit d'opposition.
 *
 * ── Pourquoi la liste est GLOBALE alors que les contacts sont scopés ──
 *
 * Un contact appartient à une candidature : la finalité est limitée, il meurt
 * avec elle. Une opposition, non. Quelqu'un qui demande à ne plus être
 * contacté ne le demande pas « pour ce candidat-là » — la scoper par profil
 * l'obligerait à répéter son refus à chaque nouvel utilisateur du produit, ce
 * qui n'est pas un droit d'opposition mais une corvée.
 *
 * ── Pourquoi une EMPREINTE ──
 *
 * Une table d'adresses de recruteurs qui se sont opposés serait encore un
 * annuaire de recruteurs — construit, cette fois, à partir de gens ayant
 * explicitement demandé qu'on les laisse tranquilles. L'ironie serait
 * complète. On garde de quoi RECONNAÎTRE, pas de quoi lire.
 */

import type pg from 'pg'
import { empreinte } from '@job-seeker/ratelimit'
import { readOptionalSecret } from '@job-seeker/env'
import type { Contact } from './certitude.ts'

const PORTEE = 'opposition-contact'

export function empreinteOpposition(adresse: string): string {
  // Même porte que la limitation de débit, portée distincte : le paquet
  // garantit que deux portées donnent des empreintes différentes, donc la
  // réutilisation du sel ne mélange pas les deux usages.
  return empreinte(PORTEE, adresse, readOptionalSecret('LIMITATION_SEL') ?? '')
}

export type Origine = 'demande-directe' | 'retour-automatique' | 'signalement'

/** Enregistre une opposition. Idempotente : se réopposer n'est pas une erreur. */
export async function enregistrerOpposition(
  db: pg.Client | pg.Pool,
  adresse: string,
  origine: Origine,
): Promise<void> {
  await db.query(
    `insert into public.oppositions_contact (empreinte, origine) values ($1, $2)
     on conflict (empreinte) do nothing`,
    [empreinteOpposition(adresse), origine],
  )
}

/**
 * Retire les contacts qui se sont opposés.
 *
 * Rendue séparément de la lecture pour que le filtrage soit un geste EXPLICITE
 * qu'on voit dans le code appelant. Un filtre appliqué en silence dans une
 * requête est un filtre qu'on oublie d'appliquer dans la deuxième requête.
 */
export async function retirerLesOpposes(
  db: pg.Client | pg.Pool,
  contacts: readonly Contact[],
): Promise<readonly Contact[]> {
  if (contacts.length === 0) return contacts
  const empreintes = contacts.map((c) => empreinteOpposition(c.adresse))
  const { rows } = await db.query<{ empreinte: string }>(
    'select empreinte from public.oppositions_contact where empreinte = any($1::text[])',
    [empreintes],
  )
  const opposees = new Set(rows.map((r) => r.empreinte))
  return contacts.filter((c) => !opposees.has(empreinteOpposition(c.adresse)))
}

/**
 * Purge les contacts expirés (OBL-3 : conservation bornée).
 *
 * Une adresse de recruteur n'a pas à survivre à l'échange qu'elle a servi, même
 * si la candidature, elle, reste au suivi.
 */
export async function purgerContactsExpires(db: pg.Client | pg.Pool): Promise<number> {
  const { rowCount } = await db.query('delete from public.contacts where expire_le < now()')
  return rowCount ?? 0
}
