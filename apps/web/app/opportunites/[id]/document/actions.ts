'use server'

/**
 * JOB-041 — enregistrer un refus.
 *
 * Une seule opération : AJOUTER un refus. Il n'existe pas d'action pour en
 * retirer un, et c'est la traduction de REQ-007 dans le code plutôt que dans
 * une consigne — un chemin qui n'existe pas ne se prend pas par erreur.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'

export type Retour = { ok: true } | { ok: false; message: string } | null

export async function refuserModification(_precedent: Retour, f: FormData): Promise<Retour> {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion')

  const opportuniteId = String(f.get('opportuniteId') ?? '')
  const cle = String(f.get('cle') ?? '')
  // Une clé est `champ:identifiant`. Une valeur d'une autre forme ne désigne
  // rien et ne doit pas entrer dans la liste — elle y resterait pour toujours.
  if (!/^[a-z]{2,30}:m\d{1,4}$/.test(cle)) return { ok: false, message: 'Modification inconnue.' }

  const supabase = await clientServeur()
  const { data } = await supabase
    .from('opportunites')
    .select('modifications_refusees')
    .eq('id', opportuniteId)
    .maybeSingle()
  // La RLS rend invisible ce qui n'est pas à nous : `null` est donc aussi la
  // réponse à « pas la vôtre », et c'est la bonne.
  if (data === null) return { ok: false, message: 'Candidature introuvable.' }

  const deja = Array.isArray(data.modifications_refusees) ? (data.modifications_refusees as string[]) : []
  if (deja.includes(cle)) return { ok: true }

  const { error } = await supabase
    .from('opportunites')
    .update({ modifications_refusees: [...deja, cle] })
    .eq('id', opportuniteId)
  if (error !== null) return { ok: false, message: 'Le refus n’a pas pu être enregistré.' }

  revalidatePath(`/opportunites/${opportuniteId}/document`)
  return { ok: true }
}
