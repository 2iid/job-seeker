'use server'

/**
 * JOB-081 — le parcours d'entrée.
 *
 * Une seule règle décide de tout ce fichier : **rien ne sort pendant le
 * parcours**. `profiles.parcours_termine_le` reste nul jusqu'à la dernière
 * étape, et `peutAgirSeule` / `peutProposer` refusent tant qu'elle l'est —
 * quel que soit le cadran que la personne vient de déplacer.
 *
 * C'est délibérément une garde en BASE et non un état d'écran. Le parcours
 * montre le cadran et invite à le manipuler, parce que c'est là qu'on comprend
 * ce qu'on accorde ; pendant ce temps l'agent cherche déjà pour de vrai. Un
 * composant qui déciderait « le parcours est fini » vit dans le navigateur, et
 * le worker n'y a pas accès.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CRANS, listeDeSaisie, type Cran } from '@job-seeker/profil'
import { clientServeur, utilisateurCourant } from '@/lib/supabase/server'

export type Retour = { ok: true } | { ok: false; message: string } | null

async function profilCourant() {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) redirect('/connexion?next=%2Fentree')
  const supabase = await clientServeur()
  const { data } = await supabase.from('profiles').select('id').single()
  if (data === null) return null
  return { supabase, profileId: data.id as string }
}

/** Étape « ce que je cherche » : le minimum pour que la veille ait une cible. */
export async function enregistrerCible(_precedent: Retour, f: FormData): Promise<Retour> {
  const courant = await profilCourant()
  if (courant === null) return { ok: false, message: 'Profil introuvable.' }
  const { supabase, profileId } = courant

  const intitules = listeDeSaisie(String(f.get('intitules') ?? ''))
  if (intitules.length === 0) {
    return { ok: false, message: 'Donnez-moi au moins un intitulé — sans cible, je n’ai rien à chercher.' }
  }

  const { error } = await supabase.from('criteres_recherche').insert({
    profile_id: profileId,
    intitules,
    zones: listeDeSaisie(String(f.get('zones') ?? '')),
    presence: ['distanciel', 'hybride', 'presentiel'].filter((p) => f.getAll('presence').includes(p)),
  })
  if (error !== null) return { ok: false, message: 'L’enregistrement a échoué.' }

  revalidatePath('/entree')
  return { ok: true }
}

/**
 * Étape « cadran » : on l'enregistre, et il ne déclenche rien.
 *
 * Enregistrer le choix pendant le parcours est voulu — la personne le fera une
 * fois, et le lui redemander à la fin serait lui faire refaire un travail
 * qu'elle a déjà fait. Ce qui ne bouge pas, c'est que le parcours n'est pas
 * terminé : la garde tient indépendamment de la valeur choisie.
 */
export async function enregistrerCran(_precedent: Retour, f: FormData): Promise<Retour> {
  const courant = await profilCourant()
  if (courant === null) return { ok: false, message: 'Profil introuvable.' }
  const { supabase, profileId } = courant

  const brut = String(f.get('cran') ?? '')
  // Une valeur hors vocabulaire n'est pas corrigée vers le plus permissif : on
  // refuse. Un formulaire trafiqué ne doit pas pouvoir monter le cadran.
  if (!(CRANS as readonly string[]).includes(brut)) {
    return { ok: false, message: 'Ce réglage n’existe pas.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ cran_autonomie: brut as Cran })
    .eq('id', profileId)
  if (error !== null) return { ok: false, message: 'L’enregistrement a échoué.' }

  revalidatePath('/entree')
  return { ok: true }
}

/**
 * Ce que la veille a trouvé, pour l'écran en direct.
 *
 * Rend ce qui EXISTE, jamais un exemple. Le critère de JOB-081 est explicite :
 * « jamais une fausse trouvaille de démonstration ». Une offre inventée pour
 * impressionner au premier écran est la pire chose que ce produit puisse
 * faire — elle vend exactement la confiance qu'il promet de mériter.
 */
export type Trouvaille = {
  readonly id: string
  readonly titre: string
  readonly employeur: string
  readonly palier: 'a' | 'b' | 'c'
  readonly minutesDepuisReleve: number
  readonly score: number | null
}

export async function veilleEnDirect(): Promise<{
  trouvailles: readonly Trouvaille[]
  sourcesInterrogees: number
}> {
  const utilisateur = await utilisateurCourant()
  if (utilisateur === null) return { trouvailles: [], sourcesInterrogees: 0 }
  const supabase = await clientServeur()

  const { data } = await supabase
    .from('opportunites')
    .select('id, score, offres!inner(titre, employeur_affiche, palier, vue_le)')
    .eq('exclue', false)
    .order('vue_le', { referencedTable: 'offres', ascending: false })
    .limit(3)

  type Ligne = {
    id: string
    score: number | null
    offres: { titre: string; employeur_affiche: string; palier: 'a' | 'b' | 'c'; vue_le: string }
  }

  const trouvailles = ((data ?? []) as unknown as Ligne[]).map((l) => ({
    id: l.id,
    titre: l.offres.titre,
    employeur: l.offres.employeur_affiche,
    palier: l.offres.palier,
    minutesDepuisReleve: Math.max(0, (Date.now() - new Date(l.offres.vue_le).getTime()) / 60_000),
    score: l.score,
  }))

  const { count } = await supabase.from('offres').select('id', { count: 'exact', head: true })
  return { trouvailles, sourcesInterrogees: count ?? 0 }
}

/**
 * La dernière étape — et la seule qui lève la garde.
 *
 * Après cet appel, et pas avant, l'agent peut agir dans les limites du cadran.
 */
export async function terminerParcours(): Promise<void> {
  const courant = await profilCourant()
  if (courant === null) redirect('/connexion?next=%2Fentree')
  const { supabase, profileId } = courant

  await supabase
    .from('profiles')
    .update({ parcours_termine_le: new Date().toISOString() })
    .eq('id', profileId)

  revalidatePath('/entree')
  redirect('/opportunites')
}
