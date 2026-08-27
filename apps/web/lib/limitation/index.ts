import { readOptionalSecret } from '@job-seeker/env'
import { limiter, type Cle, type Compteur, type Verdict } from '@job-seeker/ratelimit'
import { clientServeur } from '@/lib/supabase/server'

export { adresseAppelante } from './adresse-ip.ts'
export { POLITIQUES, reponseTropDeRequetes } from '@job-seeker/ratelimit'
export type { Verdict, Cle } from '@job-seeker/ratelimit'

/**
 * Le compteur passe par le client ORDINAIRE, pas par une clé de service.
 *
 * `consommer_jeton` est `security definer` précisément pour cela : elle doit
 * pouvoir écrire un compteur pour un visiteur NON authentifié — celui qui
 * demande un lien de connexion n'a, par définition, aucun droit. Faire venir
 * une clé de service dans l'application web pour compter des jetons mettrait
 * un passe-partout à portée de chaque route, au service du besoin le plus
 * modeste du système.
 */
const compteurSupabase: Compteur = async (cle, fenetreSecondes, plafond) => {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .rpc('consommer_jeton', {
      p_cle: cle,
      p_fenetre_secondes: fenetreSecondes,
      p_plafond: plafond,
    })
    .single<{ compte: number; fin_fenetre: string; autorise: boolean }>()

  // Rejeter, et non rendre « autorisé ». `limiter()` porte une règle ÉCRITE
  // pour l'indisponibilité, par route ; l'avaler ici la court-circuiterait en
  // silence — et le silence choisirait toujours « laisser passer ».
  if (error !== null || data === null) {
    throw new Error(`limitation indisponible: ${error?.message ?? 'aucune ligne'}`)
  }
  return {
    compte: data.compte,
    finFenetre: new Date(data.fin_fenetre),
    autorise: data.autorise,
  }
}

export async function verifierLimite(cles: readonly Cle[]): Promise<Verdict> {
  // `?? ''` et non une valeur de repli : `empreinte()` refuse un sel court,
  // bruyamment. Un sel de secours ferait taire exactement l'erreur qui compte.
  return limiter(cles, compteurSupabase, readOptionalSecret('LIMITATION_SEL') ?? '')
}
