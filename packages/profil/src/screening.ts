/**
 * JOB-045 / REQ-008 — répondre à une question de screening, ou s'arrêter.
 *
 * « Une question de screening sans réponse validée BLOQUE la soumission
 * automatique et part en file d'approbation — elle n'est jamais inventée. »
 *
 * ── Pourquoi la reconnaissance est par MOTIFS et non par un modèle ──
 *
 * Demander à un modèle « à quelle question stockée celle-ci correspond-elle ? »
 * marcherait la plupart du temps. Le reste du temps, il répondrait la réponse
 * d'une AUTRE question — « oui » à « acceptez-vous de déménager ? » parce que
 * la personne avait dit oui à « acceptez-vous le télétravail ? ».
 *
 * Une mauvaise réponse de screening n'est pas une imprécision : c'est une
 * affirmation fausse envoyée à un recruteur, sous le nom de quelqu'un, sur un
 * sujet qui décide de la suite. Le coût d'une escalade — la personne répond
 * elle-même — est sans commune mesure.
 *
 * On reconnaît donc ce qu'on reconnaît SÛREMENT, et tout le reste escalade.
 * C'est un système volontairement peu couvrant : il vaut mieux escalader
 * souvent que se tromper une fois.
 */

export type CleReponse =
  | 'pretentions'
  | 'disponibilite'
  | 'mobilite'
  | 'autorisation-travail'
  | 'preavis'
  | 'teletravail'

/**
 * Les motifs de reconnaissance, par clé.
 *
 * Chacun doit être SPÉCIFIQUE : un motif trop large attrape la question du
 * voisin, et c'est précisément l'erreur qu'on cherche à éviter. « salaire »
 * n'est pas dans `mobilite`, « déplacement » n'est pas dans `teletravail`.
 */
const MOTIFS: Readonly<Record<CleReponse, readonly RegExp[]>> = {
  pretentions: [
    /pr[ée]tentions?\s+salariales?/i,
    /salaire\s+(?:souhait[ée]|attendu|esp[ée]r[ée]|demand[ée])/i,
    /salary\s+expectations?/i,
    /expected\s+(?:salary|compensation)/i,
  ],
  disponibilite: [
    /date\s+de\s+disponibilit[ée]/i,
    /quand\s+(?:pouvez|pourriez)-vous\s+(?:commencer|d[ée]marrer)/i,
    /(?:earliest\s+)?start\s+date/i,
    /when\s+(?:can|could)\s+you\s+start/i,
  ],
  mobilite: [
    /(?:accepteriez|seriez).{0,20}(?:d[ée]m[ée]nager|mobilit[ée]\s+g[ée]ographique)/i,
    /willing\s+to\s+relocate/i,
    /open\s+to\s+relocation/i,
  ],
  'autorisation-travail': [
    /autoris(?:ation|[ée])\s+(?:de\s+)?travail/i,
    /(?:permis|titre)\s+de\s+s[ée]jour/i,
    /(?:legally\s+)?authori[sz]ed\s+to\s+work/i,
    /require\s+(?:visa\s+)?sponsorship/i,
  ],
  preavis: [
    /(?:dur[ée]e\s+de\s+)?pr[ée]avis/i,
    /notice\s+period/i,
  ],
  teletravail: [
    /t[ée]l[ée]travail/i,
    /(?:travail|poste)\s+(?:[àa]\s+)?distance/i,
    /remote\s+(?:work|working)/i,
    /work\s+from\s+home/i,
  ],
}

/**
 * La clé qu'une question désigne, ou `undefined`.
 *
 * `undefined` quand AUCUN motif ne reconnaît, mais aussi quand PLUSIEURS
 * reconnaissent : une question qui parle à la fois de télétravail et de
 * mobilité est ambiguë, et répondre à l'une des deux serait un pari.
 */
export function reconnaitre(question: string): CleReponse | undefined {
  const trouvees = (Object.entries(MOTIFS) as [CleReponse, readonly RegExp[]][])
    .filter(([, motifs]) => motifs.some((m) => m.test(question)))
    .map(([cle]) => cle)
  return trouvees.length === 1 ? trouvees[0] : undefined
}

export type ReponseStockee = {
  readonly cle: CleReponse | null
  readonly question: string
  readonly reponse: string
  /** Nul = suggestion, jamais envoyable. */
  readonly valideeLe: string | null
}

export type ResultatScreening =
  | { readonly repondre: true; readonly reponse: string; readonly cle: CleReponse }
  | {
      readonly repondre: false
      readonly motif: 'non-reconnue' | 'aucune-reponse' | 'non-validee'
      readonly cle?: CleReponse
      readonly explication: string
    }

export function repondreA(
  question: string,
  bibliotheque: readonly ReponseStockee[],
): ResultatScreening {
  const cle = reconnaitre(question)
  if (cle === undefined) {
    return {
      repondre: false,
      motif: 'non-reconnue',
      explication:
        'Je ne reconnais pas cette question avec certitude. Je préfère vous la passer plutôt que de ' +
        'répondre à côté : une mauvaise réponse ici est une affirmation fausse envoyée en votre nom.',
    }
  }

  const stockee = bibliotheque.find((r) => r.cle === cle)
  if (stockee === undefined) {
    return {
      repondre: false,
      motif: 'aucune-reponse',
      cle,
      explication: 'Vous n’avez pas encore de réponse enregistrée pour cette question.',
    }
  }
  if (stockee.valideeLe === null) {
    // Une suggestion n'est pas une réponse. « Disponible immédiatement » posé
    // par un modèle et envoyé sans relecture est exactement le genre de phrase
    // qu'un recruteur retient contre quelqu'un.
    return {
      repondre: false,
      motif: 'non-validee',
      cle,
      explication:
        'J’ai une proposition de réponse, mais vous ne l’avez pas encore validée. Je ne l’envoie pas ' +
        'tant que vous ne l’avez pas lue.',
    }
  }
  return { repondre: true, reponse: stockee.reponse, cle }
}

/**
 * Une soumission automatique est-elle possible pour ce lot de questions ?
 *
 * REQ-008 : une seule question sans réponse validée suffit à bloquer. On rend
 * la LISTE des questions bloquantes plutôt qu'un booléen : la personne doit
 * savoir ce qu'on lui demande de faire, pas seulement qu'on lui demande
 * quelque chose.
 */
export function bloquantes(
  questions: readonly string[],
  bibliotheque: readonly ReponseStockee[],
): readonly { question: string; explication: string }[] {
  return questions.flatMap((q) => {
    const r = repondreA(q, bibliotheque)
    return r.repondre ? [] : [{ question: q, explication: r.explication }]
  })
}
