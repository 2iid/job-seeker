/**
 * JOB-065 / REQ-016 — « chacun avec sa source et son niveau de certitude. Une
 * adresse devinée est présentée comme devinée, jamais comme un fait. »
 *
 * ── Ce fichier ferme F26 ──
 *
 * La défense contre l'injection de JOB-049 est complète DANS le chemin d'envoi,
 * mais `SourcesServeur` y est un paramètre : elle ne vaut que ce que vaut le
 * module qui le construit. C'est celui-ci.
 *
 * Si l'identification des contacts lisait une adresse dans le corps de
 * l'annonce, les trois couches de `destination.ts` tomberaient d'un coup —
 * elles vérifient que l'adresse vient des « sources du serveur », et le serveur
 * la tiendrait de l'attaquant.
 *
 * D'où l'énumération FERMÉE ci-dessous, où le texte d'une offre ne figure pas.
 */

export type Certitude = 'confirme' | 'probable' | 'devine'

export type SourceContact =
  /** Publiée par l'employeur sur SON domaine, pour recevoir des candidatures. */
  | 'page-carrieres'
  /** Un registre public — mentions légales, annuaire officiel. */
  | 'registre-public'
  /** La personne nous l'a donnée. La source la plus fiable qui existe. */
  | 'fourni-par-vous'
  /** Déduite d'un motif de nommage. Toujours une devinette. */
  | 'motif-de-domaine'

/**
 * La certitude que chaque source peut porter, au maximum.
 *
 * Table plutôt que `if` : ajouter une source OBLIGE à répondre à la question,
 * et l'exhaustivité du type l'impose au compilateur. Même raison que
 * `ENVOI_AUTONOME` dans `packages/profil/src/canal.ts`.
 */
export const CERTITUDE_MAX: Readonly<Record<SourceContact, Certitude>> = {
  'page-carrieres': 'confirme',
  'registre-public': 'probable',
  'fourni-par-vous': 'confirme',
  // Un motif ne produit JAMAIS mieux qu'une devinette, quelle que soit la
  // confiance qu'on a dans le motif. `prenom.nom@` marche chez neuf employeurs
  // sur dix ; le dixième reçoit un courriel adressé à quelqu'un qui n'existe
  // pas, à une adresse qui appartient peut-être à un tiers.
  'motif-de-domaine': 'devine',
}

export type Signal = {
  readonly adresse: string
  readonly source: SourceContact
  readonly nom?: string | undefined
  readonly poste?: string | undefined
  /** Ce sur quoi la certitude repose, en clair, destiné à être MONTRÉ. */
  readonly justification: string
}

export type Contact = Signal & { readonly certitude: Certitude }

export function evaluer(s: Signal): Contact {
  return { ...s, certitude: CERTITUDE_MAX[s.source] }
}

/**
 * Les contacts qu'on accepte comme DESTINATION d'un envoi.
 *
 * Une devinette n'en est jamais une. Elle peut être proposée à la personne —
 * REQ-016 le demande, présentée comme devinée — mais le produit n'écrit pas
 * tout seul à une adresse dont il n'est pas sûr qu'elle existe : au mieux le
 * message rebondit, au pire il arrive chez quelqu'un d'autre, avec un CV.
 */
export function utilisablesCommeDestination(
  contacts: readonly Contact[],
): readonly { adresse: string; provenance: 'contact-enregistre' | 'domaine-employeur' }[] {
  return contacts
    .filter((c) => c.certitude !== 'devine')
    .map((c) => ({
      adresse: c.adresse,
      provenance: c.source === 'page-carrieres' ? 'domaine-employeur' : 'contact-enregistre',
    }))
}

/** Comment le produit ANNONCE un contact. La certitude est dans la phrase. */
export function annoncer(c: Contact): string {
  const qui = c.nom !== undefined && c.nom.trim() !== '' ? c.nom.trim() : c.adresse
  switch (c.certitude) {
    case 'confirme':
      return `${qui} — ${c.justification}.`
    case 'probable':
      return `${qui} — ${c.justification}. Je n’ai pas de confirmation que c’est la bonne personne.`
    case 'devine':
      // Le mot « devinée » est dans la phrase, pas dans une icône ni une
      // nuance de gris. Quelqu'un qui survole doit le lire.
      return (
        `${qui} — adresse DEVINÉE à partir de ${c.justification}. ` +
        'Je n’ai aucune preuve qu’elle existe : vérifiez avant de l’utiliser.'
      )
  }
}
