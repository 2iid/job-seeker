import { createHmac } from 'node:crypto'

/**
 * La clé d'un compteur de débit est une EMPREINTE, jamais la valeur.
 *
 * Sur ce produit, la table de limitation de `/auth/lien` contiendrait sinon
 * l'adresse électronique de toute personne ayant demandé un lien de connexion —
 * c'est-à-dire une liste de gens qui cherchent un emploi. C'est exactement la
 * donnée que le reste du système protège, reconstituée par une table technique
 * que personne ne pense à regarder.
 *
 * HMAC-SHA-256 et pas SHA-256 nu : l'espace des adresses électroniques est
 * énumérable. Un simple condensat se retourne avec un dictionnaire. Le sel rend
 * la table inexploitable pour qui la lit sans avoir aussi le secret.
 */
export function empreinte(portee: string, valeur: string, sel: string): string {
  if (sel.length < 16) {
    // Refus bruyant, et non repli silencieux sur un condensat nu. Une
    // limitation sans sel FONCTIONNE — elle compte juste aussi bien — donc rien
    // ne signalerait la dégradation. Seule l'erreur la rend visible.
    throw new Error(
      'LIMITATION_SEL absent ou trop court (16 caractères minimum). ' +
        'Sans lui, la table de limitation devient une liste de chercheurs d’emploi.',
    )
  }
  return createHmac('sha256', sel).update(`${portee}:${valeur.trim().toLowerCase()}`).digest('hex')
}
