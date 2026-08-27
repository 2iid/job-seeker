/**
 * JOB-088 — sonder le site d'un employeur, et dire honnêtement ce qu'on y voit.
 *
 * Trois issues possibles, et la troisième est celle qui a le plus de valeur :
 *
 *   LISIBLE      — un board ATS connu, ou du `JobPosting` dans la page. On
 *                  peut relever cet employeur en palier A.
 *   ASSISTE      — un dispositif anti-robot garde l'accès. C'est un palier C,
 *                  et le produit doit le DIRE plutôt que d'insister.
 *   PLATEFORME   — un ATS qu'on ne sait pas encore lire. On note LEQUEL.
 *   INCONNU      — rien de structuré.
 *
 * ── Pourquoi noter la plateforme inconnue ──
 *
 * C'est la sortie la plus utile de tout ce module. En sondant cinq hôpitaux
 * français, on a trouvé `mstaff.co` — un ATS sectoriel santé dont personne
 * dans l'équipe n'avait entendu parler. Compter combien d'employeurs
 * l'utilisent transforme « il faudrait plus de sources » en « écris le
 * connecteur mstaff, il ouvre N hôpitaux ».
 *
 * Une découverte qui rend une liste d'échecs n'aide personne. Une découverte
 * qui rend une liste de plateformes CLASSÉES PAR NOMBRE D'EMPLOYEURS est un
 * plan de travail.
 */

import { detecterBoard, type Board } from '../ats/decouverte.ts'

/** Les plateformes de recrutement rencontrées, au-delà des cinq déjà lues. */
const PLATEFORMES = [
  'talentsoft.com', 'taleez.com', 'flatchr.io', 'softy.pro', 'welcomekit.co',
  'teamtailor.com', 'recruitee.com', 'jobvite.com', 'icims.com',
  'myworkdayjobs.com', 'successfactors.eu', 'successfactors.com',
  'mstaff.co', 'digitalrecruiters.com', 'beetween.com', 'cegid.com',
  'brassring.com', 'silkroad.com', 'jobaffinity.fr', 'eolia-recrutement.fr',
] as const

/** Les marqueurs d'un dispositif anti-robot. Les franchir serait un contournement. */
const ANTI_ROBOT = [
  'captcha.perfdrive.com', 'recaptcha', 'hcaptcha', 'cf-challenge',
  'datadome', 'incapsula', 'imperva', 'akamai-bot-manager',
] as const

const CHEMINS_CARRIERES = [
  '', '/recrutement', '/recrutements', '/emploi', '/emplois', '/offres-d-emploi',
  '/nous-rejoindre', '/carrieres', '/careers', '/jobs', '/join-us', '/rejoignez-nous',
] as const

export type Constat =
  | { readonly type: 'lisible'; readonly board: Board; readonly ou: string }
  | { readonly type: 'lisible-jsonld'; readonly ou: string }
  | { readonly type: 'assiste'; readonly dispositif: string; readonly ou: string }
  | { readonly type: 'plateforme-inconnue'; readonly plateforme: string; readonly ou: string }
  | { readonly type: 'rien' }

/**
 * Lit une page et dit ce qu'elle contient.
 *
 * L'ordre des vérifications est un ordre de PRÉCÉDENCE, pas de commodité. Un
 * anti-robot passe avant tout : une page qui porte à la fois un board connu et
 * un dispositif de protection ne doit pas être classée lisible, sinon on
 * enverrait le moteur se faire bloquer en boucle.
 */
export function examinerPage(html: string, ou: string): Constat {
  const bas = html.toLowerCase()

  const dispositif = ANTI_ROBOT.find((m) => bas.includes(m))
  if (dispositif !== undefined) return { type: 'assiste', dispositif, ou }

  const board = detecterBoard(html)
  if (board !== null) return { type: 'lisible', board, ou }

  if (bas.includes('jobposting')) return { type: 'lisible-jsonld', ou }

  const plateforme = PLATEFORMES.find((p) => bas.includes(p))
  if (plateforme !== undefined) return { type: 'plateforme-inconnue', plateforme, ou }

  return { type: 'rien' }
}

/**
 * Les liens qui mènent à un espace de recrutement.
 *
 * Ce motif est né d'un échec de mesure. La première version de cette sonde
 * n'essayait que des chemins sur le MÊME domaine — et rendait « rien » pour le
 * CHU de Nantes, dont le site de recrutement est
 * `rejoignez-le-chu-de-nantes.fr`, un domaine à part atteignable seulement par
 * un lien de la page d'accueil. C'est justement là que se trouvait `mstaff.co`,
 * l'ATS sectoriel santé que cette découverte cherchait.
 *
 * Un employeur sur deux met son recrutement ailleurs que sous `/recrutement`.
 * Une sonde qui l'ignore mesure la structure des URL, pas la présence d'offres.
 */
const LIEN_CARRIERES =
  /<a[^>]+href=["']([^"']+)["'][^>]*>(?:(?!<\/a>)[\s\S]){0,120}?(recrut|rejoign|nous rejoindre|carri[èe]re|offres? d.emploi|travailler chez|join us|careers?|jobs?)/gi

/** Extrait les liens de carrières d'une page, absolus, dédoublonnés. */
export function liensCarrieres(html: string, base: string): readonly string[] {
  const trouves: string[] = []
  for (const m of html.matchAll(LIEN_CARRIERES)) {
    const brut = m[1]
    if (brut === undefined || brut.startsWith('#') || brut.startsWith('mailto:')) continue
    try {
      const u = new URL(brut, base)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
      trouves.push(u.toString())
    } catch {
      // Un href malformé sur le site de quelqu'un n'est pas notre problème.
    }
  }
  return [...new Set(trouves)]
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Sonde un site, en essayant les chemins de carrières les plus courants.
 *
 * S'arrête au PREMIER constat exploitable. Continuer après avoir trouvé un
 * board ne servirait qu'à charger douze pages du site de quelqu'un pour rien —
 * et se comporter en nuisible chez un employeur qu'on espère ensuite
 * interroger tous les jours serait un mauvais calcul.
 */
export async function sonder(
  site: string,
  options: { fetch?: Fetch; delaiMs?: number; sautsMax?: number } = {},
): Promise<Constat> {
  const f = options.fetch ?? globalThis.fetch
  const base = site.replace(/\/+$/, '')
  let meilleur: Constat = { type: 'rien' }
  const vues = new Set<string>()

  const lire = async (url: string): Promise<string | null> => {
    if (vues.has(url)) return null
    vues.add(url)
    try {
      const r = await f(url, {
        signal: AbortSignal.timeout(options.delaiMs ?? 15_000),
        headers: { accept: 'text/html', 'user-agent': 'job-seeker/0.1 (+decouverte)' },
        redirect: 'follow',
      })
      return r.ok ? await r.text() : null
    } catch {
      return null
    }
  }

  const retenir = (c: Constat): Constat | null => {
    if (c.type === 'lisible' || c.type === 'lisible-jsonld') return c
    if (c.type !== 'rien' && meilleur.type === 'rien') meilleur = c
    return null
  }

  let accueil: string | null = null
  for (const chemin of CHEMINS_CARRIERES) {
    const html = await lire(`${base}${chemin}`)
    if (html === null) continue
    if (chemin === '') accueil = html
    const fini = retenir(examinerPage(html, chemin === '' ? '/' : chemin))
    if (fini !== null) return fini
  }

  // Un SAUT vers le lien de recrutement, quand la page d'accueil en porte un.
  // Un employeur sur deux met son recrutement sous un autre domaine, et une
  // sonde qui ne suit pas le lien mesure la structure des URL, pas la présence
  // d'offres. Un seul saut : deux nous mèneraient sur les réseaux sociaux.
  if (accueil !== null) {
    for (const lien of liensCarrieres(accueil, base).slice(0, options.sautsMax ?? 3)) {
      const html = await lire(lien)
      if (html === null) continue
      const fini = retenir(examinerPage(html, lien))
      if (fini !== null) return fini
    }
  }

  return meilleur
}

/**
 * Ce qu'un lot de sondages apprend — le vrai produit de ce module.
 *
 * Rend les plateformes inconnues classées par nombre d'employeurs. C'est ce
 * qui transforme « il faudrait plus de sources » en « écris le connecteur X,
 * il ouvre N employeurs ».
 */
export function planDeTravail(
  constats: readonly Constat[],
): readonly { plateforme: string; employeurs: number }[] {
  const comptes = new Map<string, number>()
  for (const c of constats) {
    if (c.type === 'plateforme-inconnue') comptes.set(c.plateforme, (comptes.get(c.plateforme) ?? 0) + 1)
  }
  return [...comptes]
    .sort((a, b) => b[1] - a[1])
    .map(([plateforme, employeurs]) => ({ plateforme, employeurs }))
}
