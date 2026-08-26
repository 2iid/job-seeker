/**
 * JOB-022 — retrouver le board ATS d'une entreprise depuis sa page carrière.
 *
 * PORTAGE de la stratégie de `last30days` (MIT © Matt Van Horn) : la
 * découverte part de la PAGE CARRIÈRE et lit le fournisseur et le slug
 * directement sur l'embarquement ou le lien. Le slug publié fait autorité —
 * c'est pour cela qu'on ne devine pas.
 *
 * Deviner un slug produit deux fautes silencieuses : un board d'homonyme dont
 * on afficherait les offres au nom de la mauvaise entreprise, ou un 404 qu'on
 * lirait comme « cette entreprise ne recrute pas ». Les deux sont pires que ne
 * rien trouver.
 */

export type Fournisseur = 'greenhouse' | 'ashby' | 'lever' | 'workable' | 'smartrecruiters'

export type Board = { readonly fournisseur: Fournisseur; readonly slug: string }

/** Jetons qui apparaissent dans une URL d'ATS mais ne sont jamais un slug. */
const NON_SLUGS = new Set([
  'embed', 'job_board', 'v1', 'v0', 'api', 'posting-api', 'boards', 'jobs',
  'job-boards', 'www', 'apply', 'companies', 'careers', 'search', 'en', 'fr',
])

const MOTIFS: readonly (readonly [Fournisseur, RegExp])[] = [
  ['ashby', /(?:jobs|api)\.ashbyhq\.com\/(?:posting-api\/job-board\/)?([A-Za-z0-9_.-]+)/],
  ['greenhouse', /job-boards\.greenhouse\.io\/([A-Za-z0-9_.-]+)/],
  ['greenhouse', /greenhouse\.io\/embed\/job_board\?for=([A-Za-z0-9_.-]+)/],
  ['greenhouse', /boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/|embed\/job_board\?for=)?([A-Za-z0-9_.-]+)/],
  ['lever', /(?:jobs\.lever\.co|api\.lever\.co\/v0\/postings)\/([A-Za-z0-9_.-]+)/],
  ['workable', /apply\.workable\.com\/(?:api\/v[0-9]+\/accounts\/)?([A-Za-z0-9_.-]+)/],
  ['workable', /([A-Za-z0-9_-]+)\.workable\.com/],
  ['smartrecruiters', /(?:careers|jobs)\.smartrecruiters\.com\/([A-Za-z0-9_.-]+)/],
  ['smartrecruiters', /api\.smartrecruiters\.com\/v1\/companies\/([A-Za-z0-9_.-]+)/],
]

/**
 * Lit le board dans le HTML d'une page carrière. Renvoie `null` quand rien
 * n'est publié — l'appelant tombera alors sur la lecture `schema.org`
 * (JOB-023), jamais sur une devinette.
 */
export function detecterBoard(html: string): Board | null {
  for (const [fournisseur, motif] of MOTIFS) {
    const m = motif.exec(html)
    const slug = m?.[1]
    if (slug === undefined) continue
    const propre = slug.replace(/\.(json|html?)$/i, '')
    if (NON_SLUGS.has(propre.toLowerCase()) || propre.length < 2) continue
    return { fournisseur, slug: propre }
  }
  return null
}

/** L'URL d'API correspondant à un board découvert. */
export function urlBoard(b: Board): string {
  switch (b.fournisseur) {
    case 'greenhouse':
      return `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs`
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${b.slug}`
    case 'lever':
      return `https://api.lever.co/v0/postings/${b.slug}`
    case 'workable':
      return `https://apply.workable.com/api/v3/accounts/${b.slug}/jobs`
    case 'smartrecruiters':
      return `https://api.smartrecruiters.com/v1/companies/${b.slug}/postings`
  }
}
