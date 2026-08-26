import { readOptional } from '@job-seeker/env'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Le client Supabase côté serveur.
 *
 * LA distinction qui compte dans ce fichier : `getUser()` interroge le serveur
 * d'authentification et VÉRIFIE le jeton ; `getSession()` se contente de lire
 * le cookie et de le croire. Un cookie est fourni par le client — donc par
 * l'attaquant, le cas échéant. Toute décision d'autorisation de ce produit
 * passe par `utilisateurCourant()` ci-dessous, jamais par `getSession()`.
 */
export async function clientServeur() {
  const jar = await cookies()
  return createServerClient(
    readOptional('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54521'),
    readOptional('NEXT_PUBLIC_SUPABASE_ANON_KEY', ''),
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (aPoser) => {
          try {
            for (const { name, value, options } of aPoser) jar.set(name, value, options)
          } catch {
            // Appelé depuis un composant serveur : le rafraîchissement est
            // fait par le middleware, il n'y a rien à rattraper ici.
          }
        },
      },
    },
  )
}

/**
 * L'identité vérifiée, ou `null`. Le seul point d'entrée autorisé pour décider
 * si quelqu'un a le droit de voir quelque chose.
 */
export async function utilisateurCourant(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase.auth.getUser()
  if (error !== null || data.user === null) return null
  return { id: data.user.id, email: data.user.email ?? null }
}
