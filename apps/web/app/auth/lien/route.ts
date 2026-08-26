import { destinationSure } from '@job-seeker/auth'
import { NextResponse, type NextRequest } from 'next/server'
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
 * JOB-073 doit poser une limitation de débit ici : sans elle, cette route
 * envoie des emails pour le compte de n'importe qui.
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
