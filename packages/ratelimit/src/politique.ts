/** Ce qu'on fait quand le magasin de compteurs est injoignable. */
export type SiIndisponible =
  /** Refuser. La panne devient un refus de service — assumé. */
  | 'refuser'
  /** Laisser passer. La panne devient une absence de limite — assumée. */
  | 'laisser-passer'

export type Politique = {
  readonly portee: string
  readonly fenetreSecondes: number
  readonly plafond: number
  readonly siIndisponible: SiIndisponible
}

/**
 * LA QUESTION QUI DÉCIDE DE LA FORME DE CE MODULE.
 *
 * Un limiteur qui LAISSE PASSER quand sa base est injoignable s'efface
 * précisément au moment où le système est sous tension — c'est-à-dire au moment
 * où quelqu'un tape dessus. Un limiteur qui REFUSE transforme une panne de base
 * de dix secondes en indisponibilité totale.
 *
 * Il n'y a pas de bonne réponse universelle, seulement une bonne réponse par
 * route. La règle retenue ici :
 *
 *   refuser  — dès que franchir la limite COÛTE (un appel de modèle facturé)
 *              ou SORT (un courriel expédié au nom du produit). Ces deux-là ne
 *              se rattrapent pas : une facture est payée, un courriel est reçu.
 *
 *   laisser-passer — quand bloquer ne priverait que de lecture, sans rien
 *              empêcher de fâcheux en échange.
 *
 * Il se trouve qu'aucune route de ce produit n'est dans le second cas
 * aujourd'hui. C'est écrit quand même : la prochaine le sera, et la règle doit
 * exister AVANT qu'on ait envie de la contourner.
 */
export const POLITIQUES = {
  /**
   * F9 — la demande de lien expédie un courriel pour toute adresse fournie.
   *
   * 100 et non 20. Le premier chiffre venait du réflexe « serrer fort », et le
   * smoke l'a mis en défaut en s'auto-bloquant : c'était la démonstration
   * gratuite de ce qui arriverait derrière un NAT partagé. Un espace de
   * coworking, une université, un opérateur mobile en CGNAT — tous présentent
   * UNE adresse pour des centaines de personnes. Sur un produit de recherche
   * d'emploi, celui qui postule depuis son lieu de travail est un cas courant,
   * pas un cas limite.
   *
   * Le plafond par IP n'a d'ailleurs pas pour métier de protéger une boîte —
   * c'est le travail de `auth-lien-adresse`, qui reste serré. Il borne le
   * BALAYAGE : une source qui essaie mille adresses. 100/h le borne encore très
   * largement, sans punir un immeuble.
   */
  'auth-lien-ip': {
    portee: 'auth-lien-ip',
    fenetreSecondes: 3600,
    plafond: 100,
    siIndisponible: 'refuser',
  },
  /**
   * F9 — la même route, cadenassée aussi sur l'adresse : sans cela, une seule
   * IP saturée sur vingt suffit à faire pleuvoir sur une boîte précise.
   * Plafond volontairement bas ET fenêtre courte : voir `limiter()` pour
   * pourquoi un plafond bas par adresse est une arme à double tranchant.
   */
  'auth-lien-adresse': {
    portee: 'auth-lien-adresse',
    fenetreSecondes: 900,
    plafond: 5,
    siIndisponible: 'refuser',
  },
  /** F21 — l'analyse d'un CV importé déclenche un appel de modèle facturé. */
  'analyse-modele': {
    portee: 'analyse-modele',
    fenetreSecondes: 3600,
    plafond: 10,
    siIndisponible: 'refuser',
  },
} as const satisfies Record<string, Politique>

// Il n'y a volontairement PAS de politique pour l'engendrement des documents :
// aujourd'hui il n'est déclenché que par le worker, en lot, jamais par une
// requête. Déclarer une limite qu'aucun appelant n'utilise donnerait à croire
// que ce chemin est couvert. `sans-limite.test.ts` vérifie mécaniquement que
// tout appel de modèle atteignable depuis le web en porte une.

export type NomPolitique = keyof typeof POLITIQUES
