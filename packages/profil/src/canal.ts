/**
 * ADR-0003 — quels canaux le produit accepte d'exécuter SEUL.
 *
 * JOB-002 a mesuré 88 % de formulaires ATS protégés par un anti-robot que nous
 * nous interdisons de franchir. La conséquence n'est pas « c'est difficile,
 * essayons quand même » : c'est qu'il n'existe plus de chemin de code où la
 * tentation existe. Sur un canal ATS, le produit prépare et s'arrête.
 *
 * ── Pourquoi une TABLE et pas un `if` dans la fonction d'envoi ──
 *
 * Parce que la règle doit être lisible d'un coup d'œil et vraie partout. Un
 * `if (canal === 'email')` enfoui dans l'expéditeur se duplique à la deuxième
 * fonction qui en a besoin, puis diverge. Ici, ajouter un canal OBLIGE à
 * répondre à la question — l'exhaustivité du type l'impose au compilateur.
 */
export type Canal = 'ats' | 'email' | 'formulaire'

export const ENVOI_AUTONOME: Readonly<Record<Canal, boolean>> = {
  /** Anti-robot dans 88 % des cas mesurés. Le dernier geste est humain. */
  ats: false,
  /** Le seul canal où un envoi autonome reste tenable, sous mandat. */
  email: true,
  /**
   * Un formulaire hors ATS n'est pas mieux loti : il est simplement moins
   * mesuré. « Non mesuré » n'est pas « sûr » — le défaut est le refus.
   */
  formulaire: false,
}

export function accepteEnvoiAutonome(canal: Canal): boolean {
  return ENVOI_AUTONOME[canal]
}

/**
 * Ce que le produit répond à quelqu'un qui a choisi « agir seule » sur un canal
 * qui ne le permet pas.
 *
 * ADR-0003 insiste sur ce point : la valeur reste CHOISISSABLE. Griser le
 * réglage laisserait croire à une limite technique subie, alors que c'est une
 * décision — nous ne franchissons pas un anti-robot. Dire pourquoi vaut mieux
 * qu'empêcher de demander.
 */
export function pourquoiPasSeul(canal: Canal): string {
  if (canal === 'ats') {
    return (
      'Sur ce canal, je prépare tout et je m’arrête : le dernier clic est à vous. ' +
      'Neuf formulaires sur dix y sont protégés par un test anti-robot, et je ne le contourne pas — ' +
      'ni pour vous, ni pour personne. Votre dossier sera prêt, relu, en quelques secondes.'
    )
  }
  return (
    'Sur ce canal, je prépare tout et je m’arrête : le dernier clic est à vous. ' +
    'Je n’ai pas de moyen de vérifier ce que ce formulaire attend, et envoyer à l’aveugle en votre nom ' +
    'est un risque que je ne prends pas.'
  )
}
