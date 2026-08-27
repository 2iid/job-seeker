'use server'

/**
 * JOB-048 / REQ-010 — approuver, modifier, refuser.
 *
 * Trois issues, et une seule d'entre elles est irréversible. C'est ce qui
 * décide de l'ergonomie : approuver demande un geste, refuser demande un geste
 * ET un motif, et modifier renvoie ailleurs.
 *
 * Le motif de refus n'est pas une formalité : REQ-006 en dépend. Un refus sans
 * motif écarte une offre ; un refus avec motif corrige la recherche. Trois
 * refus « salaire » veulent dire que le seuil est mal réglé — pas que ces
 * trois offres étaient mauvaises.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { MOTIFS, type MotifRefus } from '@job-seeker/profil'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'

export type Retour = { ok: true } | { ok: false; message: string } | null

async function client() {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fapprobations')
  return clientServeur()
}

export async function approuver(_precedent: Retour, f: FormData): Promise<Retour> {
  const supabase = await client()
  const id = String(f.get('id') ?? '')

  // On relit l'échéance AVANT d'approuver. Entre l'affichage de la file et le
  // clic, l'offre a pu expirer — et REQ-010 interdit d'envoyer après coup.
  // Se fier à ce qui était affiché, c'est décider dans un monde périmé.
  const { data } = await supabase
    .from('opportunites')
    .select('approbation_expire_le, archivee_le')
    .eq('id', id)
    .maybeSingle()
  if (data === null) return { ok: false, message: 'Cette candidature est introuvable.' }
  if (data.archivee_le !== null) {
    return { ok: false, message: 'Cette candidature a été archivée entre-temps.' }
  }
  const expire = data.approbation_expire_le as string | null
  if (expire !== null && new Date(expire).getTime() <= Date.now()) {
    return {
      ok: false,
      message: 'L’offre vient d’expirer. Je ne l’envoie pas : une candidature qui part après la fermeture n’arrive nulle part.',
    }
  }

  const { error } = await supabase.from('opportunites').update({ statut: 'en-file' }).eq('id', id)
  if (error !== null) return { ok: false, message: 'L’approbation n’a pas pu être enregistrée.' }
  revalidatePath('/approbations')
  return { ok: true }
}

export async function refuser(_precedent: Retour, f: FormData): Promise<Retour> {
  const supabase = await client()
  const id = String(f.get('id') ?? '')
  const motif = String(f.get('motif') ?? '')
  if (!(MOTIFS as readonly string[]).includes(motif)) {
    // Un motif hors vocabulaire n'est pas corrigé vers « autre » : il serait
    // compté comme un vrai motif et fausserait ce que REQ-006 en tire.
    return { ok: false, message: 'Choisissez un motif.' }
  }

  const { error } = await supabase
    .from('opportunites')
    .update({
      statut: 'ecartee',
      motif_refus: motif as MotifRefus,
      motif_refus_note: String(f.get('note') ?? '').trim().slice(0, 500) || null,
    })
    .eq('id', id)
  if (error !== null) return { ok: false, message: 'Le refus n’a pas pu être enregistré.' }
  revalidatePath('/approbations')
  return { ok: true }
}

/**
 * Archive ce qui a expiré sans décision.
 *
 * Appelée à l'ouverture de la file plutôt que par une tâche de fond : un
 * élément expiré ne doit JAMAIS être affiché comme décidable, et le moment où
 * ça compte est celui où quelqu'un regarde. Une tâche de fond qui tourne toutes
 * les heures laisse une fenêtre d'une heure pendant laquelle le bouton
 * « approuver » est là et n'aboutira à rien.
 */
export async function archiverExpirees(): Promise<number> {
  const supabase = await client()
  const { data, error } = await supabase
    .from('opportunites')
    .update({
      archivee_le: new Date().toISOString(),
      archivage_raison:
        'L’offre a expiré avant que vous ne décidiez. Je ne l’ai pas envoyée : une candidature qui ' +
        'part après la fermeture n’arrive nulle part, et une candidature que vous n’avez pas décidée ' +
        'ce jour-là n’est pas la vôtre.',
    })
    .is('archivee_le', null)
    .lte('approbation_expire_le', new Date().toISOString())
    .select('id')
  if (error !== null) return 0
  return (data ?? []).length
}
