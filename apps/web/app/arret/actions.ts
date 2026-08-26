'use server'

/**
 * JOB-053 / REQ-012 — l'arrêt d'urgence.
 *
 * « Effectif en moins de 5 secondes : les travaux en file sont annulés, ceux
 * en cours d'exécution sont interrompus au prochain point de contrôle, et le
 * produit dit précisément ce qui est parti avant l'arrêt. »
 *
 * ── Pourquoi l'arrêt est une ÉCRITURE et non un signal ──
 *
 * Un signal envoyé au worker suppose qu'il soit joignable, vivant, et qu'il ne
 * soit pas en train de redémarrer. `profiles.arret_urgence_le` est relue à
 * chaque point de contrôle : un worker qui redémarre la relit, un worker qu'on
 * vient de déployer la relit, un second worker qu'on ajouterait la relirait
 * aussi.
 *
 * C'est la seule forme qui tienne la clause suivante de REQ-012 : « rien ne
 * redémarre tout seul, y compris après un redéploiement ».
 *
 * ── Pourquoi il n'y a pas de confirmation ──
 *
 * REQ-012 : « en un geste, sans confirmation à plusieurs étapes ». Une
 * confirmation protège d'un arrêt accidentel — au prix de retarder un arrêt
 * VOULU. Les deux erreurs ne coûtent pas la même chose : un arrêt accidentel
 * se répare en cliquant sur « reprendre » ; un envoi qu'on n'a pas pu arrêter
 * ne se répare pas.
 *
 * La reprise, elle, EST un acte explicite — c'est le sens de l'asymétrie.
 */

import { revalidatePath } from 'next/cache'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'

export type EtatArret = {
  readonly arrete: boolean
  readonly depuis: string | null
  /** Ce qui est parti AVANT l'arrêt, dans l'heure qui l'a précédé. */
  readonly partiJusteAvant: readonly { id: string; canal: string; le: string }[]
}

const VIDE: EtatArret = { arrete: false, depuis: null, partiJusteAvant: [] }

async function profilCourant() {
  // Pas de `redirect` ici : ces actions sont appelées depuis la mise en page
  // RACINE, y compris sur les écrans publics. Rediriger un visiteur non
  // connecté depuis la racine le renverrait en boucle vers la connexion.
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) return null
  const supabase = await clientServeur()
  const { data } = await supabase.from('profiles').select('id, arret_urgence_le').single()
  return data === null ? null : { supabase, profil: data }
}

export async function arreterTout(): Promise<void> {
  const courant = await profilCourant()
  if (courant === null) return
  await courant.supabase
    .from('profiles')
    .update({ arret_urgence_le: new Date().toISOString() })
    .eq('id', courant.profil.id)

  // Toutes les routes : l'état d'arrêt s'affiche partout, et un écran resté en
  // cache dirait « au travail » alors que tout est arrêté.
  revalidatePath('/', 'layout')
}

export async function reprendre(): Promise<void> {
  const courant = await profilCourant()
  if (courant === null) return
  await courant.supabase
    .from('profiles')
    .update({ arret_urgence_le: null })
    .eq('id', courant.profil.id)
  revalidatePath('/', 'layout')
}

/**
 * Ce qui est parti juste avant l'arrêt.
 *
 * REQ-012 exige que le produit dise PRÉCISÉMENT ce qui est parti avant. Sans
 * cette liste, quelqu'un qui arrête en catastrophe reste avec la seule
 * question qui compte — « est-ce que celle-là est partie ? » — et aucune
 * réponse. Les reçus sont immuables : ils SONT la réponse, et c'est à ça
 * qu'ils servent le jour où ça compte.
 */
export async function etatArret(): Promise<EtatArret> {
  const courant = await profilCourant()
  if (courant === null) return VIDE
  const { supabase, profil } = courant
  const depuis = profil.arret_urgence_le as string | null
  if (depuis === null) return VIDE

  const heureAvant = new Date(new Date(depuis).getTime() - 3_600_000).toISOString()
  const { data } = await supabase
    .from('recus')
    .select('id, canal, envoye_le')
    .gte('envoye_le', heureAvant)
    .lte('envoye_le', depuis)
    .order('envoye_le', { ascending: false })

  return {
    arrete: true,
    depuis,
    partiJusteAvant: (data ?? []).map((r) => ({
      id: r.id as string,
      canal: r.canal as string,
      le: r.envoye_le as string,
    })),
  }
}
