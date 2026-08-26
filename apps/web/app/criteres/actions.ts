'use server'

/**
 * JOB-034 — enregistrer des critères, c'est en écrire une NOUVELLE version.
 *
 * Jamais une modification. REQ-002 : « on peut expliquer a posteriori pourquoi
 * une offre a matché à un instant donné ». Une offre proposée mardi l'a été
 * selon les critères de mardi ; si mercredi les écrase, l'explication de mardi
 * devient une reconstruction — et une reconstruction n'est pas une
 * explication, c'est une hypothèse à laquelle personne ne peut plus opposer
 * les faits.
 *
 * Le numéro de version est attribué par la base (déclencheur
 * `criteres_recherche_numerote`). Rien ici ne le calcule : le seul endroit qui
 * voit toutes les écritures est celui qui doit décider.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { listeDeSaisie, montantEnUnitesMineures } from '@job-seeker/profil'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'

export type Retour = { ok: true; version: number } | { ok: false; message: string } | null

async function profilCourant() {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fcriteres')
  const supabase = await clientServeur()
  const { data } = await supabase.from('profiles').select('id').single()
  if (data === null) return null
  return { supabase, profileId: data.id as string }
}

const PRESENCES = ['distanciel', 'hybride', 'presentiel'] as const

export async function enregistrerCriteres(_precedent: Retour, f: FormData): Promise<Retour> {
  const courant = await profilCourant()
  if (courant === null) return { ok: false, message: 'Profil introuvable.' }
  const { supabase, profileId } = courant

  const salaire = montantEnUnitesMineures(String(f.get('salaireMin') ?? ''))
  if (salaire === 'illisible') {
    return {
      ok: false,
      message: 'Le salaire minimum n’a pas été compris. Écrivez un nombre, par exemple 45000 ou 3 500.',
    }
  }

  const { data, error } = await supabase
    .from('criteres_recherche')
    .insert({
      profile_id: profileId,
      intitules: listeDeSaisie(String(f.get('intitules') ?? '')),
      seniorite: String(f.get('seniorite') ?? '').trim() || null,
      // Les cases cochées : on ne garde que les valeurs connues. Un formulaire
      // trafiqué ne doit pas semer une présence que le moteur ne sait pas lire.
      presence: PRESENCES.filter((p) => f.getAll('presence').includes(p)),
      zones: listeDeSaisie(String(f.get('zones') ?? '')),
      salaire_min_unites_mineures: salaire,
      salaire_devise: salaire === null ? null : String(f.get('salaireDevise') ?? 'EUR').trim().toUpperCase() || 'EUR',
      secteurs: listeDeSaisie(String(f.get('secteurs') ?? '')),
      langues: listeDeSaisie(String(f.get('langues') ?? '')),
      mots_redhibitoires: listeDeSaisie(String(f.get('motsRedhibitoires') ?? '')),
    })
    .select('version')
    .single()

  if (error !== null || data === null) {
    return { ok: false, message: 'L’enregistrement a échoué. Vos critères précédents sont intacts.' }
  }

  revalidatePath('/criteres')
  revalidatePath('/profil')
  return { ok: true, version: data.version as number }
}

export async function exclureEmployeur(_precedent: Retour, f: FormData): Promise<Retour> {
  const courant = await profilCourant()
  if (courant === null) return { ok: false, message: 'Profil introuvable.' }
  const { supabase, profileId } = courant

  const nom = String(f.get('employeur') ?? '').trim()
  if (nom === '') return { ok: false, message: 'Indiquez le nom de l’employeur.' }

  const { error } = await supabase.from('employeurs_exclus').upsert(
    {
      profile_id: profileId,
      // La forme canonique est celle du registre d'employeurs : sans elle,
      // « Qonto » et « qonto SAS » seraient deux exclusions distinctes et
      // l'une des deux ne servirait à rien.
      employeur_canonique: nom.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
      motif: String(f.get('motif') ?? '').trim() || null,
    },
    { onConflict: 'profile_id,employeur_canonique', ignoreDuplicates: true },
  )
  if (error !== null) return { ok: false, message: 'L’exclusion n’a pas pu être enregistrée.' }

  revalidatePath('/criteres')
  return { ok: true, version: 0 }
}

export async function retirerExclusion(_precedent: Retour, f: FormData): Promise<Retour> {
  const courant = await profilCourant()
  if (courant === null) return { ok: false, message: 'Profil introuvable.' }
  const { supabase, profileId } = courant

  const { error } = await supabase
    .from('employeurs_exclus')
    .delete()
    .eq('id', String(f.get('id') ?? ''))
    // Filtre explicite en plus de la RLS : deux verrous plutôt qu'un sur une
    // suppression.
    .eq('profile_id', profileId)

  if (error !== null) return { ok: false, message: 'Le retrait n’a pas pu être enregistré.' }
  revalidatePath('/criteres')
  return { ok: true, version: 0 }
}
