/**
 * JOB-072 — les tarifs, et ce qu'on sait d'eux.
 *
 * Ferme le constat **F18** : les tarifs étaient trois nombres posés dans
 * `bascule.ts`, sans date ni provenance. Le problème n'est pas qu'ils soient
 * saisis à la main — c'est le bon choix, un tarif relevé sur le web change
 * sous nos pieds et rend nos factures inexplicables. Le problème est qu'un
 * nombre sans date ne peut pas être audité : personne ne peut dire s'il vaut
 * encore, ni depuis quand il ne vaut plus.
 *
 * ── Ce qui arrive à un modèle inconnu ──
 *
 * Il n'a PAS de tarif par défaut. Facturer un modèle inconnu au prix d'un
 * autre produirait une facture fausse qui a l'air juste, et c'est pire que pas
 * de facture du tout : on croirait maîtriser une dépense qu'on ne mesure plus.
 * `tarif()` rend `undefined`, et l'appelant doit décider quoi en faire — le
 * journal, lui, écrit l'usage sans coût plutôt que d'inventer un montant.
 */

export type Tarif = {
  readonly inputEurParMillion: number
  readonly outputEurParMillion: number
  /** Quand ce tarif a été relevé, à la main, sur la page publique du fournisseur. */
  readonly releveLe: string
  readonly source: string
}

/**
 * Saisis à la main, jamais relevés automatiquement.
 *
 * Un tarif qu'on va chercher sur le web change sans qu'on le sache, et rend
 * une facture d'hier inexplicable aujourd'hui. Celui-ci ne bouge que par un
 * commit, avec une date et une revue.
 */
export const TARIFS: Readonly<Record<string, Tarif>> = {
  'claude-opus-5': {
    inputEurParMillion: 4.6,
    outputEurParMillion: 23,
    releveLe: '2026-08-25',
    source: 'anthropic.com/pricing',
  },
  'anthropic/claude-opus-4.1': {
    inputEurParMillion: 13.8,
    outputEurParMillion: 69,
    releveLe: '2026-08-25',
    source: 'openrouter.ai/anthropic/claude-opus-4.1',
  },
}

/** Au-delà, un tarif est trop vieux pour qu'on réponde du montant qu'il produit. */
export const PEREMPTION_JOURS = 120

export type EtatTarif =
  | { readonly connu: true; readonly tarif: Tarif; readonly perime: boolean; readonly ageJours: number }
  | { readonly connu: false }

export function tarif(modele: string, maintenant: Date = new Date()): EtatTarif {
  const t = TARIFS[modele]
  if (t === undefined) return { connu: false }
  const ageJours = Math.floor((maintenant.getTime() - new Date(t.releveLe).getTime()) / 86_400_000)
  return { connu: true, tarif: t, perime: ageJours > PEREMPTION_JOURS, ageJours }
}

/** Le coût en euros d'un appel. Rend `null` quand le tarif est inconnu. */
export function coutEur(
  modele: string,
  tokensEntree: number,
  tokensSortie: number,
  maintenant: Date = new Date(),
): number | null {
  const e = tarif(modele, maintenant)
  if (!e.connu) return null
  return (
    (tokensEntree / 1_000_000) * e.tarif.inputEurParMillion +
    (tokensSortie / 1_000_000) * e.tarif.outputEurParMillion
  )
}
