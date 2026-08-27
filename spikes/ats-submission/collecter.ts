/**
 * JOB-002 — rassembler de vraies URL de candidature, chez les cinq fournisseurs.
 *
 * On réemploie les connecteurs du moteur plutôt que de coller des liens à la
 * main : ce qu'on mesure doit être ce que le produit rencontrera réellement,
 * et une liste écrite à la main choisirait sans le vouloir les formulaires les
 * plus simples.
 */

import { connecteurAts } from '../../apps/worker/src/sources/ats/connecteur.ts'
import type { Board } from '../../apps/worker/src/sources/ats/decouverte.ts'

/** Des boards publics, un par fournisseur au moins. */
const BOARDS: readonly Board[] = [
  { fournisseur: 'greenhouse', slug: 'airbnb' },
  { fournisseur: 'greenhouse', slug: 'stripe' },
  { fournisseur: 'ashby', slug: 'ramp' },
  { fournisseur: 'ashby', slug: 'linear' },
  { fournisseur: 'lever', slug: 'palantir' },
  { fournisseur: 'lever', slug: 'swordhealth' },
  { fournisseur: 'workable', slug: 'skroutz' },
  { fournisseur: 'workable', slug: 'blueground' },
  // SmartRecruiters : aucun board public trouvé au 2026-08-27. Dix slugs
  // d'entreprises connues répondent 200 avec `totalFound: 0`. On le CONSIGNE
  // plutôt que d'inventer une cible — un fournisseur non mesuré doit
  // apparaître comme non mesuré dans la conclusion, pas comme un blanc.
  { fournisseur: 'smartrecruiters', slug: 'Deliveroo' },
]

export type Cible = {
  readonly fournisseur: string
  readonly employeur: string
  readonly titre: string
  readonly url: string
}

export async function collecter(parBoard = 2): Promise<readonly Cible[]> {
  const cibles: Cible[] = []
  for (const b of BOARDS) {
    const c = connecteurAts(b, b.slug)
    const r = await c.recolter({ requete: '' })
    if (r.etat !== 'ok' && r.etat !== 'partiel') {
      console.log(`  ${b.fournisseur}/${b.slug} → ${r.etat}`)
      continue
    }
    for (const o of r.offres.slice(0, parBoard)) {
      cibles.push({ fournisseur: b.fournisseur, employeur: o.employeur, titre: o.titre, url: o.urlCandidature })
    }
    console.log(`  ${b.fournisseur}/${b.slug} → ${Math.min(parBoard, r.offres.length)} cible(s)`)
    await new Promise((r) => setTimeout(r, 600))
  }
  return cibles
}
