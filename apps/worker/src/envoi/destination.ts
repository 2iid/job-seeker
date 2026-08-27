/**
 * REQ-011 — « Toute destination sortante provient de données vérifiées côté
 * serveur, jamais du contenu récupéré. » C'est le fichier qui porte cette
 * phrase, et il n'y en a qu'un.
 *
 * ── La menace, en une phrase ──
 *
 * N'importe qui peut publier une annonce. Si l'adresse de destination pouvait
 * venir, même indirectement, du texte de l'annonce, alors publier une offre
 * suffirait à faire expédier le CV de quelqu'un — nom, parcours, coordonnées —
 * à l'adresse de son choix. Le produit deviendrait un service de collecte de
 * données personnelles, à la demande, gratuit.
 *
 * ── Pourquoi un TYPE et pas une vérification ──
 *
 * Une fonction `verifier(adresse)` qu'on oublie d'appeler ne proteste pas. La
 * défense est donc portée par le type : `envoyer()` n'accepte que
 * `DestinationVerifiee`, et cette valeur ne peut être fabriquée que par
 * `verifierDestination()`. Un appelant qui aurait extrait une adresse du texte
 * de l'annonce n'a littéralement pas de valeur à passer — le compilateur
 * l'arrête avant la revue de code.
 */

/**
 * Marque non falsifiable. Un VRAI symbole, et non `declare const … : unique
 * symbol` : cette forme-là est purement typologique, elle disparaît au
 * dépouillement des types de Node, et la clé `[VERIFIEE]` du littéral se
 * retrouve sans définition à l'exécution. La marque doit exister DEUX fois —
 * pour le compilateur et pour la machine.
 *
 * Non exporté : aucun autre module ne peut fabriquer la clé, donc aucun autre
 * module ne peut fabriquer une destination vérifiée.
 */
const VERIFIEE: unique symbol = Symbol('destination-verifiee')

export type DestinationVerifiee = {
  readonly adresse: string
  readonly domaine: string
  /** D'OÙ vient cette adresse. Consigné dans le reçu, pas seulement décidé. */
  readonly provenance: Provenance
  readonly [VERIFIEE]: true
}

/**
 * Les seules origines admises. Le texte de l'annonce n'y figure pas, et ce
 * n'est pas un oubli : l'énumération est fermée pour qu'ajouter une origine
 * soit un changement visible, discuté, et non un paramètre de plus.
 */
export type Provenance =
  /** Une ligne de contact établie et vérifiée côté serveur (JOB-065). */
  | 'contact-enregistre'
  /** L'adresse de candidature publiée par l'employeur sur SON domaine. */
  | 'domaine-employeur'

export type SourcesServeur = {
  /** Adresses connues du serveur pour cette opportunité. Jamais le texte. */
  readonly contacts: readonly { adresse: string; provenance: Provenance }[]
  /** Domaines de l'employeur, établis par le registre — pas par l'annonce. */
  readonly domainesEmployeur: readonly string[]
}

export type RefusDestination =
  | 'adresse-illisible'
  | 'inconnue-du-serveur'
  | 'domaine-non-employeur'
  | 'domaine-trompeur'

export type ResultatDestination =
  | { verifiee: DestinationVerifiee }
  | { refus: RefusDestination; explication: string }

/**
 * Découpe une adresse en partie locale et domaine.
 *
 * Prend le DERNIER `@`, jamais le premier : `careers@vrai.fr@pirate.example`
 * est une adresse valide dont le domaine est `pirate.example`. Une lecture
 * naïve y voit `vrai.fr`, la déclare légitime, et poste chez le pirate.
 */
function domaineDe(brut: string): { local: string; domaine: string } | null {
  const a = brut.trim()
  // Un nom d'affichage — `"careers@vrai.fr" <pirate@mal.example>` —, une
  // virgule, un point-virgule ou un saut de ligne sont refusés EN ENTIER
  // plutôt que déballés : nous construisons l'en-tête nous-mêmes, donc une
  // adresse légitime n'en contient jamais. Un `\n` glissé ici ajouterait un
  // « Bcc: » invisible.
  if (/[<>",;\s]/.test(a)) return null
  // Le DERNIER `@`, jamais le premier : `careers@vrai.fr@pirate.example` est
  // une adresse valide dont le domaine est `pirate.example`. Une lecture naïve
  // y voit `vrai.fr`, la déclare légitime, et poste chez le pirate.
  const coupe = a.lastIndexOf('@')
  if (coupe <= 0 || coupe === a.length - 1) return null
  const local = a.slice(0, coupe)
  if (local.includes('@')) return null
  return { local, domaine: a.slice(coupe + 1).toLowerCase() }
}

/**
 * Un domaine est-il celui de l'employeur, ou un sous-domaine de celui-ci ?
 *
 * `mail.exemple.fr` sous `exemple.fr` : oui. `exemple.fr.pirate.example` :
 * NON — c'est le piège qu'un `endsWith` naïf laisse passer, et il est
 * indiscernable à l'œil dans un journal.
 */
function relevesDu(domaine: string, employeur: string): boolean {
  const e = employeur.toLowerCase()
  return domaine === e || domaine.endsWith(`.${e}`)
}

/**
 * Une adresse ne contenant que de l'ASCII imprimable ne peut pas se déguiser.
 *
 * `exemplе.fr` avec un « е » cyrillique s'affiche EXACTEMENT comme
 * `exemple.fr`. Aucune relecture humaine ne les distingue — et c'est là le
 * point : la vérification tiendrait, la REVUE ne tiendrait pas. On refuse donc
 * plutôt que de normaliser ; un employeur à domaine international sera traité
 * explicitement le jour venu, ce qui est le bon moment pour en parler.
 */
function estAsciiImprimable(s: string): boolean {
  for (const c of s) {
    const p = c.codePointAt(0) ?? 0
    if (p < 0x21 || p > 0x7e) return false
  }
  return true
}

export function verifierDestination(
  candidate: string,
  sources: SourcesServeur,
): ResultatDestination {
  const adresse = candidate.trim().toLowerCase()

  // L'ORDRE des refus est celui de l'information rendue. Une adresse malformée
  // n'est pas « trompeuse » : elle est inexploitable, et le dire aide. On
  // établit donc la FORME d'abord, et on ne parle de déguisement que pour une
  // chaîne qui en avait bien une.
  const parts = domaineDe(adresse)
  if (parts === null) {
    return { refus: 'adresse-illisible', explication: 'Cette adresse n’est pas exploitable.' }
  }

  if (!estAsciiImprimable(adresse)) {
    return {
      refus: 'domaine-trompeur',
      explication:
        'Cette adresse contient des caractères qui peuvent en imiter d’autres à l’identique. ' +
        'Je ne l’utilise pas.',
    }
  }

  const { domaine } = parts
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domaine)) {
    return { refus: 'adresse-illisible', explication: 'Cette adresse n’est pas exploitable.' }
  }

  // 1. Le serveur connaît-il cette adresse ? C'est la question qui compte : une
  //    adresse absente de nos propres données vient forcément d'ailleurs.
  const connue = sources.contacts.find((c) => c.adresse.trim().toLowerCase() === adresse)
  if (connue === undefined) {
    return {
      refus: 'inconnue-du-serveur',
      explication:
        'Cette adresse ne figure pas dans les contacts que j’ai établis pour cette offre. ' +
        'Je n’écris qu’à des destinataires que j’ai vérifiés moi-même.',
    }
  }

  // 2. Et son domaine est-il bien celui de l'employeur ? DEUX verrous plutôt
  //    qu'un : une ligne de contact corrompue en base ne suffit pas à sortir du
  //    domaine, et un domaine légitime ne suffit pas à écrire à un inconnu.
  if (!sources.domainesEmployeur.some((e) => relevesDu(domaine, e))) {
    return {
      refus: 'domaine-non-employeur',
      explication: 'Cette adresse ne relève pas d’un domaine de cet employeur. Je m’arrête ici.',
    }
  }

  return {
    verifiee: { adresse, domaine, provenance: connue.provenance, [VERIFIEE]: true },
  }
}

/** Rend l'adresse pour l'expéditeur. Seule sortie de la marque. */
export function adresseDe(d: DestinationVerifiee): string {
  return d.adresse
}

/**
 * La marque, revérifiée À L'EXÉCUTION.
 *
 * Le type seul arrête l'erreur honnête. Il n'arrête pas
 * `as unknown as DestinationVerifiee`, ni un objet reconstruit depuis du JSON —
 * or un travail de file transite justement par du JSON, où un symbole ne
 * survit pas. Sans ce contrôle, la défense s'évaporait à la frontière de la
 * sérialisation, en silence.
 */
export function estVerifiee(d: unknown): d is DestinationVerifiee {
  return typeof d === 'object' && d !== null && (d as Record<symbol, unknown>)[VERIFIEE] === true
}
