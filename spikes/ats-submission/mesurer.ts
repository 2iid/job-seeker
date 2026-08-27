/**
 * JOB-002 — la mesure. `node --experimental-strip-types spikes/ats-submission/mesurer.ts`
 *
 * Elle ouvre de vrais formulaires de candidature et NE SOUMET RIEN.
 */

import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { collecter } from './collecter.ts'
import { sonderFormulaire, type Resultat } from './sonder-formulaire.ts'

const cibles = await collecter(2)
console.log(`\n${cibles.length} cible(s) à sonder\n`)

const navigateur = await chromium.launch({ headless: true })
const resultats: Resultat[] = []

for (const c of cibles) {
  const r = await sonderFormulaire(navigateur, c)
  resultats.push(r)
  const detail = r.etat === 'anti-robot' ? r.antiRobot
    : r.etat === 'inatteignable' ? r.note
    : `${r.champs.length} champs · ${r.inattendus.length} inattendus · ${r.piecesJointes} pj`
  console.log(`  ${r.fournisseur.padEnd(16)} ${r.etat.padEnd(14)} ${String(Math.round(r.msJusquAuPret / 100) / 10).padStart(5)}s  ${detail}`)
  // Une seconde entre deux visites chez le même hôte : on mesure chez des gens
  // qu'on espère interroger tous les jours ensuite.
  await new Promise((r) => setTimeout(r, 1200))
}

await navigateur.close()

const parEtat = new Map<string, number>()
for (const r of resultats) parEtat.set(r.etat, (parEtat.get(r.etat) ?? 0) + 1)
console.log('\n══ bilan ══')
for (const [k, v] of [...parEtat].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}  (${Math.round((100 * v) / resultats.length)} %)`)
}

const remplissables = resultats.filter((r) => r.etat === 'remplissable')
if (remplissables.length > 0) {
  const moyen = remplissables.reduce((n, r) => n + r.msJusquAuPret, 0) / remplissables.length
  console.log(`\n  temps moyen jusqu'au « prêt » : ${Math.round(moyen / 100) / 10} s`)
}
const inattendus = new Map<string, number>()
for (const r of resultats) for (const i of r.inattendus) inattendus.set(i, (inattendus.get(i) ?? 0) + 1)
if (inattendus.size > 0) {
  console.log('\n══ champs requis NON prévus ══')
  for (const [k, v] of [...inattendus].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(v).padStart(3)} × ${k}`)
  }
}
writeFileSync(
  new URL('./resultats.json', import.meta.url),
  JSON.stringify(resultats, null, 2) + '\n',
)
console.log('\nrésultats écrits dans spikes/ats-submission/resultats.json')
