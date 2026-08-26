/**
 * La liste d'autorisation des redirections apres connexion.
 *
 * C'est la faille la plus banale d'un flux d'authentification : un parametre
 * `?next=` recopie tel quel, et l'attaquant se sert de VOTRE page de connexion
 * pour renvoyer l'utilisateur chez lui, sur une page qui ressemble a la votre.
 *
 * Les contournements que ce module refuse, un par un :
 *   - l'URL absolue vers un autre hote
 *   - `//evil.example`, relatif au protocole, que le navigateur suit
 *   - la barre inversee, que certains parseurs normalisent en barre normale
 *   - `javascript:` et `data:`
 *   - une forme encodee qui passe la liste sous un visage et est suivie sous
 *     un autre
 *   - un caractere de controle, qui tronque l'analyse de certains clients
 *   - un chemin non declare, meme parfaitement interne
 *
 * La regle est une correspondance EXACTE sur une liste, jamais un motif. Un
 * motif finit toujours par autoriser ce qu'on n'avait pas prevu.
 */

export const DESTINATIONS_AUTORISEES = [
  '/',
  '/accueil',
  '/opportunites',
  '/approbations',
  '/suivi',
  '/profil',
  '/agent',
] as const

export type DestinationAutorisee = (typeof DESTINATIONS_AUTORISEES)[number]

export const DESTINATION_PAR_DEFAUT: DestinationAutorisee = '/accueil'

/** Espace, tabulation, saut de ligne, octet nul : tout ce qui est <= 0x20. */
function contientCaractereDeControle(valeur: string): boolean {
  for (const c of valeur) {
    if ((c.codePointAt(0) ?? 0) <= 0x20) return true
  }
  return false
}

/**
 * Renvoie une destination sure. Ne leve jamais : une redirection douteuse
 * devient la destination par defaut, parce qu'echouer bruyamment ici
 * renverrait un utilisateur legitime sur une page d'erreur pour la faute de
 * quelqu'un d'autre.
 */
export function destinationSure(demandee: string | null | undefined): DestinationAutorisee {
  if (typeof demandee !== 'string' || demandee === '') return DESTINATION_PAR_DEFAUT

  // Decodage AVANT verification : sinon une forme encodee passerait la liste
  // et une autre serait suivie par le navigateur.
  let candidat: string
  try {
    candidat = decodeURIComponent(demandee)
  } catch {
    return DESTINATION_PAR_DEFAUT
  }

  if (contientCaractereDeControle(candidat)) return DESTINATION_PAR_DEFAUT

  const normalise = candidat.replaceAll('\\', '/')
  if (!normalise.startsWith('/')) return DESTINATION_PAR_DEFAUT
  if (normalise.startsWith('//')) return DESTINATION_PAR_DEFAUT

  const sansQuery = normalise.split('?')[0]?.split('#')[0] ?? ''
  const sansSlashFinal = sansQuery.length > 1 ? sansQuery.replace(/\/+$/, '') : sansQuery

  return (DESTINATIONS_AUTORISEES as readonly string[]).includes(sansSlashFinal)
    ? (sansSlashFinal as DestinationAutorisee)
    : DESTINATION_PAR_DEFAUT
}
