/**
 * JOB-076 — la mesure de couverture, rejouable.
 *
 * `node --experimental-strip-types docs/research/couverture/mesurer.ts`
 *
 * Elle interroge les VRAIES API publiques. Elle est donc lente, dépendante du
 * réseau, et son résultat change d'un jour à l'autre — raison pour laquelle
 * elle vit ici et non dans la suite de tests : une mesure qui varie n'est pas
 * une assertion, et la faire échouer un build serait confondre les deux.
 *
 * Ce qui ne doit PAS varier, c'est l'ordre de grandeur. Le jour où un profil
 * non-tech passe de zéro à plusieurs dizaines, c'est une nouvelle — et c'est
 * en rejouant ceci qu'on l'apprendra.
 */
import { connecteursAgregateurs } from '../../../apps/worker/src/sources/agregateurs/connecteurs.ts'

const PROFILS = [
  { id: 'marketing-dakar', libelle: 'Cheffe de projet marketing · Dakar (SN)', requete: 'marketing manager', pays: 'SN' },
  { id: 'infirmier-nantes', libelle: 'Infirmier coordinateur · Nantes (FR)', requete: 'infirmier', pays: 'FR' },
  { id: 'backend-remote-ca', libelle: 'Senior backend engineer · distanciel (CA)', requete: 'backend engineer', pays: 'CA' },
  { id: 'comptable-lyon', libelle: 'Comptable · Lyon (FR)', requete: 'comptable', pays: 'FR' },
  { id: 'enseignant-bogota', libelle: 'Enseignant d anglais · Bogotá (CO)', requete: 'english teacher', pays: 'CO' },
]

const connecteurs = connecteursAgregateurs()
const resultats: Record<string, unknown>[] = []

for (const p of PROFILS) {
  for (const c of connecteurs) {
    const t0 = Date.now()
    let etat = 'erreur', total = 0, pertinentes = 0, note = ''
    try {
      const r = await c.recolter({ requete: p.requete, pays: p.pays })
      etat = r.etat
      total = r.offres.length
      const mots = p.requete.toLowerCase().split(' ')
      pertinentes = r.offres.filter((o) => {
        const t = `${o.titre} ${o.description ?? ''}`.toLowerCase()
        return mots.some((m) => t.includes(m))
      }).length
      note = r.note ?? ''
    } catch (e) {
      note = e instanceof Error ? e.message.slice(0, 80) : ''
    }
    resultats.push({ profil: p.id, libelle: p.libelle, source: c.id, etat, total, pertinentes, ms: Date.now() - t0, note })
    console.log(`${p.id.padEnd(20)} ${c.id.padEnd(24)} ${etat.padEnd(14)} total=${String(total).padStart(4)} pertinentes=${String(pertinentes).padStart(4)}`)
    await new Promise((r) => setTimeout(r, 1200))
  }
}

console.log('\n' + JSON.stringify(resultats))
