/**
 * Le nom d'un fichier téléchargé, construit SANS rien tirer du contenu.
 *
 * ── Pourquoi ne pas y mettre l'intitulé de l'offre ──
 *
 * Ce serait plus agréable, et ce serait une entrée d'en-tête HTTP construite à
 * partir d'un texte publié par un inconnu. `Content-Disposition` accepte une
 * chaîne entre guillemets : un guillemet, un point-virgule ou un retour à la
 * ligne dans un titre d'annonce y injecte ce qu'on veut — un autre paramètre,
 * un autre en-tête.
 *
 * On peut échapper. On peut aussi ne pas avoir le problème : l'identifiant et
 * la date suffisent à retrouver un fichier, et ils ne viennent que de nous.
 */
export function nomFichierRecu(id: string, envoyeLe: string, extension: 'txt' | 'json'): string {
  const jour = /^\d{4}-\d{2}-\d{2}/.exec(envoyeLe)?.[0] ?? 'sans-date'
  const court = /^[0-9a-f-]{36}$/i.test(id) ? id.slice(0, 8) : 'recu'
  return `recu-${jour}-${court}.${extension}`
}

export function nomFichierLot(maintenant: Date): string {
  return `recus-${maintenant.toISOString().slice(0, 10)}.json`
}
