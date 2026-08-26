/**
 * JOB-082 — les plateformes de palier C, et pourquoi elles en sont.
 *
 * Palier C veut dire une chose précise : **une plateforme que nous ne pouvons
 * pas parcourir légitimement**. Pas « difficile », pas « pas encore fait » —
 * pas le droit, ou pas sans se comporter en nuisible.
 *
 * Le produit doit le DIRE plutôt que faire semblant de la couvrir. C'est le
 * cœur de REQ-003 appliqué non plus à une panne, mais à une frontière : « je ne
 * regarde pas là » est une information que l'utilisateur a le droit d'avoir, et
 * qu'un silence lui volerait — il croirait ces plateformes couvertes.
 *
 * ── Ce que ce fichier n'est pas ──
 *
 * Ce n'est pas une liste de cibles à traiter plus tard. Chaque entrée porte le
 * MOTIF de son classement, et un motif juridique ne se périme pas parce que
 * l'outillage progresse. Reclasser une entrée en palier A ou B demande que le
 * motif ait cessé d'être vrai — une API officielle ouverte, des conditions
 * modifiées — et pas qu'on ait trouvé un moyen de contourner.
 */

export type MotifAssiste =
  /** Les conditions d'utilisation interdisent la collecte automatisée. */
  | 'conditions-interdisent'
  /** L'accès exige une session personnelle : l'automatiser, c'est usurper. */
  | 'session-personnelle'
  /** Un dispositif anti-robot garde l'accès. Le franchir est un contournement. */
  | 'anti-robot'

export type PlateformeAssistee = {
  readonly id: string
  readonly nom: string
  /** Les hôtes qui la désignent, pour reconnaître une URL rencontrée ailleurs. */
  readonly hotes: readonly string[]
  readonly motif: MotifAssiste
  /** Ce qu'on dit à l'utilisateur. Écrit pour lui, pas pour nos notes. */
  readonly explication: string
}

export const PLATEFORMES_ASSISTEES: readonly PlateformeAssistee[] = [
  {
    id: 'linkedin',
    nom: 'LinkedIn',
    hotes: ['linkedin.com', 'www.linkedin.com'],
    motif: 'conditions-interdisent',
    explication:
      'LinkedIn interdit la collecte automatisée dans ses conditions. Je vous prépare votre dossier, ' +
      'vous l’envoyez depuis votre compte.',
  },
  {
    id: 'indeed',
    nom: 'Indeed',
    hotes: ['indeed.com', 'fr.indeed.com', 'www.indeed.com'],
    motif: 'anti-robot',
    explication:
      'Indeed protège son accès par un dispositif anti-robot. Le franchir serait un contournement, ' +
      'et je ne le ferai pas en votre nom.',
  },
  {
    id: 'glassdoor',
    nom: 'Glassdoor',
    hotes: ['glassdoor.com', 'glassdoor.fr', 'www.glassdoor.com'],
    motif: 'anti-robot',
    explication:
      'Glassdoor protège son accès par un dispositif anti-robot. Je vous prépare votre dossier, ' +
      'l’envoi reste votre geste.',
  },
  {
    id: 'welcome-to-the-jungle',
    nom: 'Welcome to the Jungle',
    hotes: ['welcometothejungle.com', 'www.welcometothejungle.com'],
    motif: 'conditions-interdisent',
    explication:
      'Welcome to the Jungle interdit la collecte automatisée. Je vous prépare votre dossier et vous ' +
      'renvoie vers l’annonce.',
  },
  {
    id: 'apec',
    nom: 'APEC',
    hotes: ['apec.fr', 'www.apec.fr'],
    motif: 'session-personnelle',
    explication:
      'L’APEC demande une session personnelle pour postuler. L’automatiser reviendrait à me faire ' +
      'passer pour vous, et je ne le ferai pas.',
  },
]

const PAR_HOTE = new Map<string, PlateformeAssistee>(
  PLATEFORMES_ASSISTEES.flatMap((p) => p.hotes.map((h) => [h.toLowerCase(), p] as const)),
)

/**
 * La plateforme assistée qu'une URL désigne, ou `undefined`.
 *
 * La comparaison porte sur l'HÔTE, jamais sur l'URL entière : chercher
 * « linkedin.com » dans une chaîne classerait
 * `https://exemple.test/?ref=linkedin.com` en palier C, et surtout
 * `https://linkedin.com.attaquant.test/` passerait pour LinkedIn dans l'autre
 * sens. Un sous-domaine explicitement listé compte ; un domaine qui se termine
 * par le nôtre ne compte pas.
 */
export function plateformeAssistee(url: string): PlateformeAssistee | undefined {
  let hote: string
  try {
    hote = new URL(url).hostname.toLowerCase()
  } catch {
    return undefined
  }
  return PAR_HOTE.get(hote)
}

/** Vrai si cette URL relève du palier C. Aucune candidature n'en part seule. */
export function estAssistee(url: string): boolean {
  return plateformeAssistee(url) !== undefined
}
