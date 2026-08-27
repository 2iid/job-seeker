import { destinationSure } from '@job-seeker/auth'
import { NextResponse, type NextRequest } from 'next/server'
import { adresseAppelante, POLITIQUES, verifierLimite } from '@/lib/limitation'
import { clientServeur } from '@/lib/supabase/server'

/**
 * Demande d'un lien de connexion.
 *
 * Deux règles qui se voient dans le code :
 *
 *  - La réponse est la MÊME que l'adresse existe ou non. Répondre
 *    différemment transformerait cette route en oracle : un attaquant y
 *    testerait des adresses pour savoir qui est inscrit — c'est-à-dire, ici,
 *    qui cherche un emploi. Sur ce produit, cette fuite est particulièrement
 *    coûteuse : elle peut trahir quelqu'un auprès de son employeur.
 *
 *  - La destination passe par la liste d'autorisation AVANT d'être envoyée au
 *    fournisseur, sinon le lien reçu par email porterait la redirection ouverte.
 *
 * JOB-073 pose la limitation de débit (F9) — et la pose de telle sorte
 * qu'elle ne DÉFASSE PAS la première règle. C'est le vrai piège de cette
 * route : une limite par adresse est, en elle-même, un oracle. Si le refus
 * arrivait plus tôt, ou disait autre chose, pour une adresse inscrite que pour
 * une inconnue, il suffirait de compter les refus pour savoir qui est inscrit.
 *
 * Trois conséquences, toutes visibles ci-dessous :
 *   1. le jeton d'adresse est consommé AVANT toute idée de regarder si le
 *      compte existe — ce qui est facile ici, puisqu'on ne le regarde jamais ;
 *   2. le message de refus est le même pour les deux portées et pour une panne ;
 *   3. l'IP est évaluée en premier, donc un tiers ne peut pas brûler le quota
 *      de quelqu'un sans épuiser le sien d'abord.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const email = String(form.get('email') ?? '').trim()
  const destination = destinationSure(String(form.get('next') ?? ''))
  const origine = new URL(request.url).origin
  const versEnvoye = new URL(`/connexion?envoye=1&next=${encodeURIComponent(destination)}`, origine)

  if (email === '' || !email.includes('@')) {
    return NextResponse.redirect(new URL('/connexion?erreur=adresse', origine), { status: 303 })
  }

  // ── La limitation, avant l'envoi et avant tout regard sur le compte ──
  const verdict = await verifierLimite([
    { politique: POLITIQUES['auth-lien-ip'], valeur: adresseAppelante(request.headers) },
    { politique: POLITIQUES['auth-lien-adresse'], valeur: email },
  ])
  if (!verdict.autorise) {
    // Une redirection, comme tous les autres chemins de cette route : un 429
    // en JSON ici distinguerait déjà « limité » de « envoyé » à l'œil nu dans
    // l'onglet réseau. Le paramètre ne nomme pas la portée.
    return NextResponse.redirect(new URL('/connexion?erreur=trop-de-demandes', origine), {
      status: 303,
      headers: { 'retry-after': String(verdict.reessayerDans) },
    })
  }

  const supabase = await clientServeur()
  await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origine}/auth/callback?next=${encodeURIComponent(destination)}`,
    },
  })

  // Volontairement : on ne regarde pas l'erreur. Le résultat visible est
  // identique dans tous les cas.
  return NextResponse.redirect(versEnvoye, { status: 303 })
}
