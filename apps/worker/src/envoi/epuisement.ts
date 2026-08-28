/**
 * JOB-050 — « un échec est réessayé avec retrait progressif, borné, PUIS
 * ESCALADÉ À L'HUMAIN ».
 *
 * Les deux premiers tiers existent déjà : `worker.jobs` compte les tentatives,
 * l'attente croît, et le travail passe à `failed` quand le compte est atteint.
 *
 * Le dernier tiers manquait. Un travail `failed` est visible dans une
 * statistique et par personne d'autre — et une ligne dans un compteur n'est pas
 * une escalade à un humain. C'est la différence entre « le système sait » et
 * « la personne sait ».
 */

import type pg from 'pg'
import type { Canal } from '@job-seeker/profil'
import { escaladeReessaisEpuises } from './escalade.ts'

export type Epuisement = {
  readonly opportuniteId: string
  readonly canal: Canal
  readonly tentatives: number
  readonly derniereErreur: string
}

/**
 * Consigne l'épuisement sur le dossier et fait passer l'opportunité en
 * escalade.
 *
 * ── Le `profile_id` n'est PAS un paramètre ──
 *
 * Il est lu depuis l'opportunité, dans la même requête. F27 avait montré qu'un
 * appelant pouvait passer deux identifiants incohérents et rendre le dossier
 * d'Alice visible par Bob ; une clé étrangère composite l'interdit désormais.
 * Ne pas prendre le paramètre du tout est un cran plus haut : le désaccord ne
 * peut pas être exprimé.
 */
export async function escaladerEpuisement(
  db: pg.Client | pg.Pool,
  e: Epuisement,
): Promise<boolean> {
  const escalade = await db
    .query<{ employeur: string }>(
      `select o.employeur_affiche as employeur
         from public.opportunites op join public.offres o on o.id = op.offre_id
        where op.id = $1`,
      [e.opportuniteId],
    )
    .then((r) => r.rows[0])
  if (escalade === undefined) return false

  const message = escaladeReessaisEpuises(escalade.employeur, e.tentatives, e.derniereErreur)

  await db.query('begin')
  try {
    const { rowCount } = await db.query(
      `insert into public.dossiers
         (profile_id, opportunite_id, canal, manques, pret, issue, issue_motif)
       select op.profile_id, op.id, $2, $3::jsonb, false, 'refuse', $4
         from public.opportunites op
        where op.id = $1
       on conflict (opportunite_id, canal) do update
         -- On n'écrase JAMAIS un envoi parti : l'épuisement d'un réessai
         -- postérieur ne doit pas effacer la preuve de ce qui a fonctionné.
         set manques = excluded.manques, issue = excluded.issue,
             issue_motif = excluded.issue_motif, pret = false,
             reclame_le = null, reclame_par = null, bail_jusqu_a = null,
             updated_at = now()
       where public.dossiers.issue is distinct from 'envoye'`,
      [
        e.opportuniteId, e.canal,
        JSON.stringify([message.constat, message.conduite]),
        `escalade-${message.motif}`,
      ],
    )
    // `statut = 'escalade'` seulement si le dossier a bougé : une opportunité
    // déjà envoyée reste envoyée.
    if ((rowCount ?? 0) > 0) {
      await db.query(
        "update public.opportunites set statut = 'escalade' where id = $1 and statut <> 'envoyee'",
        [e.opportuniteId],
      )
    }
    await db.query('commit')
    return (rowCount ?? 0) > 0
  } catch (cause) {
    await db.query('rollback')
    throw cause
  }
}
