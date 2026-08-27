/**
 * JOB-057 / REQ-014 — écrire dans le journal d'audit, sans y écrire ce qu'il protège.
 *
 * « Journal d'audit sur les accès et actions sensibles, y compris ceux du
 * support. »
 *
 * ── La règle qui tient tout ce fichier ──
 *
 * On note **la table et l'identifiant**, jamais le contenu. Un journal d'audit
 * qui recopie ce qu'il protège est une seconde fuite — et une fuite plus
 * durable que la première, puisqu'un journal se conserve longtemps, se réplique,
 * et finit dans un outil de recherche.
 *
 * Le typage l'impose plutôt que de le demander : `detail` n'accepte que des
 * valeurs scalaires courtes, et `assainir` refuse ce qui ressemble à du contenu.
 * Une consigne dans un commentaire aurait tenu jusqu'au premier incident où
 * quelqu'un ajoute « et le texte, pour comprendre ».
 */

export type Acteur = 'candidat' | 'support' | 'worker' | 'systeme'

/**
 * Les actions qu'on journalise.
 *
 * Une liste close, et pas une chaîne libre. Un vocabulaire ouvert produit
 * quarante orthographes de la même action en six mois, et un journal qu'on ne
 * peut pas agréger ne répond à aucune question.
 */
export type Action =
  | 'lecture-dossier'
  | 'lecture-etat-candidature'
  | 'export-donnees'
  | 'suppression-compte'
  | 'mandat-accorde'
  | 'mandat-revoque'
  | 'arret-urgence'
  | 'reprise-apres-arret'
  | 'envoi-sortant'
  | 'acces-support'
  | 'changement-cran'

/** Une valeur admise dans le détail. Ni objet, ni tableau, ni texte long. */
export type Valeur = string | number | boolean

export type Entree = {
  readonly acteur: Acteur
  readonly acteurId?: string | null
  readonly action: Action
  readonly objetTable: string
  readonly objetId?: string | null
  readonly profileId?: string | null
  readonly detail?: Readonly<Record<string, Valeur>>
}

/** Au-delà, ce n'est plus un repère : c'est du contenu. */
export const LONGUEUR_MAX_VALEUR = 64

/** Les clés qui trahissent une tentative de journaliser du contenu. */
const CLES_INTERDITES =
  /^(cv|lettre|message|texte|contenu|description|corps|body|content|email|mail|telephone|phone|nom|name|adresse|address)/i

export type Rejet = { readonly cle: string; readonly raison: 'cle-interdite' | 'trop-long' }

/**
 * Filtre un détail, et rend ce qui a été écarté.
 *
 * Les rejets sont RENDUS, pas silencieux : appeler ceci et ignorer son second
 * résultat serait la même faute que celle qu'on prévient. Le journal note
 * ensuite combien de clés ont été écartées — savoir qu'on a tenté d'écrire du
 * contenu est en soi une information d'audit.
 */
export function assainir(
  detail: Readonly<Record<string, unknown>>,
): { garde: Record<string, Valeur>; rejets: Rejet[] } {
  const garde: Record<string, Valeur> = {}
  const rejets: Rejet[] = []

  for (const [cle, valeur] of Object.entries(detail)) {
    if (CLES_INTERDITES.test(cle)) {
      rejets.push({ cle, raison: 'cle-interdite' })
      continue
    }
    if (typeof valeur === 'number' || typeof valeur === 'boolean') {
      garde[cle] = valeur
      continue
    }
    if (typeof valeur !== 'string') {
      // Un objet ou un tableau transporte du contenu par construction : on ne
      // cherche pas à l'aplatir, on le refuse.
      rejets.push({ cle, raison: 'trop-long' })
      continue
    }
    if (valeur.length > LONGUEUR_MAX_VALEUR) {
      rejets.push({ cle, raison: 'trop-long' })
      continue
    }
    garde[cle] = valeur
  }

  return { garde, rejets }
}

export type Ecrivain = (ligne: {
  acteur: Acteur
  acteur_id: string | null
  action: Action
  objet_table: string
  objet_id: string | null
  profile_id: string | null
  detail: Record<string, Valeur | number>
}) => Promise<void>

/**
 * Journalise une entrée.
 *
 * N'échoue jamais silencieusement sur le contenu : ce qui a été écarté est
 * compté dans `detail_rejete`, et ce compte est lui-même une information — une
 * action qui tente d'écrire du contenu à chaque appel mérite qu'on regarde le
 * code qui l'appelle.
 */
export async function journaliser(ecrire: Ecrivain, e: Entree): Promise<Rejet[]> {
  const { garde, rejets } = assainir(e.detail ?? {})
  await ecrire({
    acteur: e.acteur,
    acteur_id: e.acteurId ?? null,
    action: e.action,
    objet_table: e.objetTable,
    objet_id: e.objetId ?? null,
    profile_id: e.profileId ?? null,
    detail: rejets.length === 0 ? garde : { ...garde, detail_rejete: rejets.length },
  })
  return rejets
}

/**
 * Les actions qu'un support ne fait JAMAIS sans motif.
 *
 * Un accès de support sans référence de ticket n'est pas auditable : « le
 * support a lu ce dossier » ne dit pas s'il en avait le droit. Exiger le motif
 * à l'écriture est la seule façon de l'avoir — le redemander après coup, c'est
 * demander à quelqu'un de justifier ce qu'il a déjà fait.
 */
export const EXIGENT_UN_MOTIF: readonly Action[] = ['lecture-dossier', 'acces-support']

export function motifManquant(e: Entree): boolean {
  if (e.acteur !== 'support') return false
  if (!EXIGENT_UN_MOTIF.includes(e.action)) return false
  const m = e.detail?.['motif']
  return typeof m !== 'string' || m.trim() === ''
}
