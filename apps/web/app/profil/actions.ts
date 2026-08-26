'use server'

/**
 * JOB-033 — écrire le profil, et laisser une trace de ce qu'il était.
 *
 * Chaque action se termine par `figer_profil()`. Ce n'est pas une écriture de
 * confort : REQ-002 promet d'expliquer *a posteriori* pourquoi une offre a
 * matché à un instant donné, et cette promesse n'a de sens que si l'état sur
 * lequel l'agent a jugé existe encore quelque part.
 *
 * La fonction ne crée une version que si le profil a bougé — enregistrer trois
 * fois le même formulaire ne produit pas trois versions identiques.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { lireDate } from '@job-seeker/parsing'
import { lireCodesPays } from '@job-seeker/profil'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'

export type Retour = { ok: true } | { ok: false; message: string } | null

/** Le profil de l'utilisateur VÉRIFIÉ. Jamais un identifiant venu du formulaire. */
async function profilCourant() {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fprofil')
  const supabase = await clientServeur()
  const { data } = await supabase.from('profiles').select('id').single()
  if (data === null) return null
  return { supabase, profileId: data.id as string }
}

export async function enregistrerIdentite(_precedent: Retour, f: FormData): Promise<Retour> {
  const courant = await profilCourant()
  if (courant === null) return { ok: false, message: 'Profil introuvable.' }
  const { supabase, profileId } = courant

  const locale = String(f.get('locale') ?? 'fr')
  const { error } = await supabase
    .from('profiles')
    .update({
      titre_accroche: String(f.get('titreAccroche') ?? '').trim() || null,
      fuseau: String(f.get('fuseau') ?? 'Europe/Paris').trim() || 'Europe/Paris',
      locale: locale === 'en' ? 'en' : 'fr',
      autorisation_travail: lireCodesPays(String(f.get('autorisationTravail') ?? '')),
    })
    .eq('id', profileId)

  if (error !== null) return { ok: false, message: 'L’enregistrement a échoué. Rien n’a été modifié.' }

  await supabase.rpc('figer_profil', { p_profile_id: profileId })
  revalidatePath('/profil')
  return { ok: true }
}

export async function enregistrerExperience(_precedent: Retour, f: FormData): Promise<Retour> {
  const courant = await profilCourant()
  if (courant === null) return { ok: false, message: 'Profil introuvable.' }
  const { supabase, profileId } = courant

  const employeur = String(f.get('employeur') ?? '').trim()
  const intitule = String(f.get('intitule') ?? '').trim()
  const debut = lireDate(String(f.get('debut') ?? ''))
  const fin = lireDate(String(f.get('fin') ?? ''))

  if (employeur === '' || intitule === '') {
    return { ok: false, message: 'L’employeur et l’intitulé sont nécessaires.' }
  }
  if (debut === null) {
    // On ne choisit pas de date à la place de quelqu'un. « 2019 » suffit ; une
    // date inventée ne se distinguerait plus jamais d'une date donnée.
    return {
      ok: false,
      message: 'La date de début n’a pas été comprise. Une année seule suffit — par exemple « 2019 » ou « mars 2019 ».',
    }
  }

  const ligne = {
    employeur,
    intitule,
    debut: debut.iso,
    debut_precision: debut.precision,
    fin: fin?.iso ?? null,
    fin_precision: fin?.precision ?? null,
    description: String(f.get('description') ?? '').trim() || null,
  }

  const id = String(f.get('id') ?? '')
  const { error } =
    id === ''
      ? await supabase.from('experiences').insert({ ...ligne, profile_id: profileId })
      : // `.eq('profile_id')` en plus de `.eq('id')` : la RLS suffirait, mais un
        // filtre explicite fait que le jour où une politique est desserrée par
        // erreur, cette requête ne devient pas pour autant une écriture chez
        // autrui. Deux verrous plutôt qu'un, sur une écriture de donnée
        // personnelle.
        await supabase.from('experiences').update(ligne).eq('id', id).eq('profile_id', profileId)

  if (error !== null) return { ok: false, message: 'L’enregistrement de l’expérience a échoué.' }

  await supabase.rpc('figer_profil', { p_profile_id: profileId })
  revalidatePath('/profil')
  return { ok: true }
}

export async function ajouterCompetence(_precedent: Retour, f: FormData): Promise<Retour> {
  const courant = await profilCourant()
  if (courant === null) return { ok: false, message: 'Profil introuvable.' }
  const { supabase, profileId } = courant

  const libelles = String(f.get('libelles') ?? '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
  if (libelles.length === 0) return { ok: false, message: 'Rien à ajouter.' }

  const { error } = await supabase
    .from('competences')
    // `unique (profile_id, libelle)` : une compétence déjà présente n'est pas
    // une erreur à montrer, c'est un doublon à ignorer.
    .upsert(
      [...new Set(libelles)].map((libelle) => ({ profile_id: profileId, libelle })),
      { onConflict: 'profile_id,libelle', ignoreDuplicates: true },
    )

  if (error !== null) return { ok: false, message: 'L’enregistrement des compétences a échoué.' }

  await supabase.rpc('figer_profil', { p_profile_id: profileId })
  revalidatePath('/profil')
  return { ok: true }
}
