import { readOptional } from '@job-seeker/env'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Deux rôles, et un seul des deux protège quoi que ce soit.
 *
 *  1. Rafraîchir la session à chaque requête, pour qu'une session expirée
 *     cesse d'être acceptée immédiatement plutôt qu'au prochain rechargement.
 *  2. Rediriger vers la connexion — c'est de l'ERGONOMIE, pas de la sécurité.
 *     Un middleware peut être contourné ; la vraie garantie est la RLS, qui
 *     s'applique dans la base quel que soit le chemin emprunté.
 */

const PROTEGES = ['/accueil', '/opportunites', '/approbations', '/suivi', '/profil', '/agent']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    readOptional('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54521'),
    readOptional('NEXT_PUBLIC_SUPABASE_ANON_KEY', ''),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (aPoser) => {
          for (const { name, value } of aPoser) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of aPoser) response.cookies.set(name, value, options)
        },
      },
    },
  )

  // getUser, jamais getSession : on vérifie auprès du serveur d'authentification
  // au lieu de croire un cookie que le client nous a tendu.
  const { data } = await supabase.auth.getUser()

  const chemin = request.nextUrl.pathname
  const estProtege = PROTEGES.some((p) => chemin === p || chemin.startsWith(`${p}/`))

  if (estProtege && data.user === null) {
    const vers = request.nextUrl.clone()
    vers.pathname = '/connexion'
    vers.search = `?next=${encodeURIComponent(chemin)}`
    return NextResponse.redirect(vers)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
}
