/**
 * JOB-050 / REQ-011 — s'arrêter, et dire pourquoi.
 *
 * ── Ce que l'ADR-0003 change à cette issue ──
 *
 * L'exigence dit : « un anti-robot rencontré ARRÊTE le traitement et le
 * consigne ; aucun contournement n'est tenté, jamais ». Depuis l'ADR-0003 il
 * n'existe plus de chemin de soumission automatique : on ne rencontre donc plus
 * un anti-robot en ENVOYANT, mais en LISANT le formulaire pour savoir quoi
 * préparer.
 *
 * Ça ne rend pas la règle décorative — ça la déplace. Un service de détection
 * de robots qui nous repère pendant la lecture va empreinter puis bloquer
 * l'hôte : continuer à charger la page est à la fois futile et malpoli. On
 * s'arrête, on consigne, on prépare ce qu'on peut sans le formulaire.
 *
 * ── L'asymétrie qui guide la détection ──
 *
 * Un FAUX POSITIF coûte une escalade inutile : la personne lit « je n'ai pas pu
 * lire ce formulaire » alors qu'on aurait pu. Agaçant, réparable.
 * Un FAUX NÉGATIF ne coûte rien de dangereux, puisque rien ne sera soumis de
 * toute façon — au pire on continue à charger une page qui nous bloque.
 *
 * On peut donc se permettre d'être PRÉCIS plutôt que large : chercher les
 * marqueurs du widget lui-même, et pas la simple mention du mot. Une page de
 * politique de confidentialité qui explique « nous utilisons reCAPTCHA » n'est
 * pas une page protégée par reCAPTCHA.
 */

export type MotifEscalade =
  /** Un dispositif anti-robot barre la lecture du formulaire. */
  | 'anti-robot'
  /** Un champ requis dont on ignore ce qu'il attend. */
  | 'champ-inconnu'
  /** Une question de screening qu'on ne sait pas rattacher à une réponse. */
  | 'question-non-reconnue'
  /** Une réponse existe mais n'a jamais été validée par la personne. */
  | 'reponse-non-validee'
  /** La plateforme n'est pas lisible automatiquement (palier C). */
  | 'plateforme-illisible'
  /** Les réessais bornés sont épuisés. */
  | 'reessais-epuises'

export type Escalade = {
  readonly motif: MotifEscalade
  /** Ce que le produit a constaté. Destiné à être LU. */
  readonly constat: string
  /** Ce que la personne peut faire. Jamais absent. */
  readonly conduite: string
  /** Ce qui l'a déclenché, pour le journal — jamais pour l'écran. */
  readonly detail?: string
}

// ---------------------------------------------------------------------------
//  Détection d'un dispositif anti-robot
// ---------------------------------------------------------------------------

/**
 * Les marqueurs du WIDGET, pas du mot.
 *
 * Chaque motif désigne quelque chose qu'une page ne contient que si le
 * dispositif y est réellement posé : un script chargé depuis le domaine du
 * fournisseur, un conteneur avec sa classe, un champ caché avec son nom.
 */
const MARQUEURS: readonly { readonly nom: string; readonly motif: RegExp }[] = [
  { nom: 'reCAPTCHA', motif: /(?:google\.com|gstatic\.com)\/recaptcha\//i },
  { nom: 'reCAPTCHA', motif: /\bg-recaptcha(?:-response)?\b/i },
  { nom: 'hCaptcha', motif: /\bhcaptcha\.com\/(?:1\/api\.js|captcha)/i },
  { nom: 'hCaptcha', motif: /\bh-captcha(?:-response)?\b/i },
  { nom: 'Cloudflare Turnstile', motif: /challenges\.cloudflare\.com\/turnstile/i },
  { nom: 'Cloudflare Turnstile', motif: /\bcf-turnstile(?:-response)?\b/i },
  { nom: 'DataDome', motif: /\bdatadome\b.{0,40}(?:captcha|challenge|js)/i },
  { nom: 'DataDome', motif: /captcha-delivery\.com/i },
  { nom: 'Imperva Incapsula', motif: /_Incapsula_Resource|incapsula\.com\/_Incapsula/i },
  { nom: 'PerimeterX', motif: /perfdrive\.com|\b_px[A-Za-z]*Captcha\b/i },
  { nom: 'Arkose Labs', motif: /arkoselabs\.com|funcaptcha/i },
]

export type Detection = { readonly present: true; readonly nom: string } | { readonly present: false }

/**
 * Un dispositif anti-robot est-il posé sur cette page ?
 *
 * Rend le NOM du dispositif quand il y en a un. Le nom sert au journal et à
 * l'explication ; il ne sert jamais à choisir une stratégie, parce qu'il n'y a
 * pas de stratégie — voir `interdictionDeContourner` plus bas.
 */
export function detecterAntiRobot(html: string): Detection {
  const trouve = MARQUEURS.find((m) => m.motif.test(html))
  return trouve === undefined ? { present: false } : { present: true, nom: trouve.nom }
}

/**
 * Ce que le produit dit — et NE dit pas — quand il rencontre un anti-robot.
 *
 * Il ne propose pas de « réessayer plus tard », parce que ça ne changera rien.
 * Il ne propose pas non plus de solution de contournement, parce qu'il n'y en a
 * pas qu'on accepterait d'écrire.
 */
export function escaladeAntiRobot(nom: string, employeur: string): Escalade {
  return {
    motif: 'anti-robot',
    detail: nom,
    constat:
      `Le formulaire de ${employeur} est protégé par un test anti-robot. ` +
      'Je ne le franchis pas — ni pour vous, ni pour personne.',
    conduite:
      'Votre dossier est prêt : ouvrez l’offre, collez les pièces, et faites le dernier geste. ' +
      'C’est une minute, et c’est la seule façon honnête d’y arriver.',
  }
}

// ---------------------------------------------------------------------------
//  Champs et questions
// ---------------------------------------------------------------------------

export type Champ = {
  readonly etiquette: string
  readonly requis: boolean
  /** La catégorie qu'on sait remplir, ou `null` — c'est ça, un champ inattendu. */
  readonly connu: string | null
}

/**
 * Les champs qu'on ne sait pas remplir.
 *
 * Un champ FACULTATIF inconnu n'escalade pas : on le laisse vide, ce qui est
 * exactement ce qu'un humain ferait. Seul un champ REQUIS bloque — sans quoi le
 * produit réveillerait quelqu'un pour un « comment nous avez-vous connus ? ».
 */
export function champsBloquants(champs: readonly Champ[]): readonly Champ[] {
  return champs.filter((c) => c.requis && c.connu === null)
}

export function escaladeChampInconnu(champs: readonly Champ[], employeur: string): Escalade {
  const noms = champs.map((c) => `« ${c.etiquette.trim()} »`)
  return {
    motif: 'champ-inconnu',
    detail: noms.join(', '),
    constat:
      `Le formulaire de ${employeur} demande ${noms.length === 1 ? 'un champ' : 'des champs'} ` +
      `dont j’ignore ce qu’il${noms.length === 1 ? '' : 's'} attend${noms.length === 1 ? '' : 'ent'} : ` +
      `${noms.join(', ')}.`,
    // On ne devine PAS. Une réponse inventée part au nom de quelqu'un et
    // engage sa parole auprès d'un employeur.
    conduite:
      'Dites-moi quoi répondre et je le retiendrai pour les prochaines fois. ' +
      'Je préfère vous déranger une fois que répondre à votre place.',
  }
}

export function escaladeQuestion(question: string, validee: boolean, employeur: string): Escalade {
  return validee
    ? {
        motif: 'reponse-non-validee',
        detail: question,
        constat:
          `J’ai une réponse pour « ${question.trim()} », mais vous ne l’avez jamais relue.`,
        conduite: 'Relisez-la une fois : ensuite je m’en sers seule pour ce type de question.',
      }
    : {
        motif: 'question-non-reconnue',
        detail: question,
        constat: `${employeur} pose une question que je ne sais pas rattacher : « ${question.trim()} ».`,
        conduite: 'Répondez-y une fois et je la reconnaîtrai la prochaine fois.',
      }
}

export function escaladePlateforme(plateforme: string, employeur: string): Escalade {
  return {
    motif: 'plateforme-illisible',
    detail: plateforme,
    constat: `${employeur} recrute via une plateforme que je ne sais pas lire (${plateforme}).`,
    conduite:
      'Je vous ai préparé le dossier ; la candidature elle-même passe par vous. ' +
      'Je vous assiste, je ne postule pas.',
  }
}

/**
 * Le dernier réessai a échoué.
 *
 * La file réessaie avec retrait progressif et borné, puis marque le travail
 * `failed`. Un travail « failed » est visible dans une statistique et par
 * personne d'autre : REQ-011 demande une escalade À L'HUMAIN, et une ligne dans
 * un compteur n'en est pas une.
 */
export function escaladeReessaisEpuises(
  employeur: string,
  tentatives: number,
  derniereErreur: string,
): Escalade {
  return {
    motif: 'reessais-epuises',
    detail: derniereErreur,
    constat:
      `Je n’ai pas réussi à préparer votre candidature chez ${employeur} après ` +
      `${String(tentatives)} tentatives.`,
    // On ne recopie PAS l'erreur technique dans le constat : elle ne dit rien
    // à qui la lit, et elle peut contenir une URL interne ou un jeton.
    conduite:
      'Ce n’est pas de votre fait. Vous pouvez candidater à la main en attendant ; ' +
      'je reprends si vous me le demandez.',
  }
}
