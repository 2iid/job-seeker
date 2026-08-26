import { destinationSure } from '@job-seeker/auth'
import { NextResponse, type NextRequest } from 'next/server'
import { clientServeur } from '@/lib/supabase/server'

/**
 * Le retour du fournisseur d'identité.
 *
 * La destination n'est JAMAIS celle demandée : elle passe par la liste
 * d'autorisation. C'est ici que se joue la redirection ouverte — le paramètre
 * `next` vient de l'extérieur, et un attaquant qui contrôle ce paramètre se
 * sert de notre page de connexion pour renvoyer l'utilisateur chez lui.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const destination = destinationSure(url.searchParams.get('next'))

  if (code === null) {
    return NextResponse.redirect(new URL('/connexion?erreur=code_absent', url.origin))
  }

  const supabase = await clientServeur()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error !== null) {
    // Le motif exact n'est pas renvoyé au client : il renseignerait un
    // attaquant sur la validité d'un code sans rien apporter à l'utilisateur.
    return NextResponse.redirect(new URL('/connexion?erreur=echange', url.origin))
  }

  return NextResponse.redirect(new URL(destination, url.origin))
}
