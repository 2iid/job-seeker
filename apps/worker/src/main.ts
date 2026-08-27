import { createServer } from 'node:http'
import { readOptional } from '@job-seeker/env'
import { creerJournal, evaluerSante } from '@job-seeker/observability'
import pg from 'pg'
import { stats } from './queue/index.ts'
import {
  etatInitial, evaluerReconciliation, PERIODE_MS, unTour,
} from './receipts/boucle.ts'

/**
 * Le worker (ADR-0001).
 *
 * La frontière que ce fichier rend matérielle : il ne porte AUCUNE session
 * utilisateur et n'expose AUCUNE route publique hors de sa sonde de santé.
 * Tout ce qu'il fera — veille, génération, soumission — lui arrive par la file
 * durable, jamais par une requête entrante. Une route qui accepterait du
 * travail depuis l'extérieur serait une porte d'entrée sur des actions
 * sortantes faites au nom de quelqu'un.
 */

const PORT = Number(readOptional('PORT_WORKER', '3110'))
const journal = creerJournal({ runtime: 'worker' })

const pool = new pg.Pool({
  connectionString: readOptional('DATABASE_URL', 'postgresql://postgres:postgres@127.0.0.1:54522/postgres'),
  max: 4,
})

// REQ-013 — « une action sans reçu est un incident : le produit ALERTE ».
// Cette boucle est le « le produit » de cette phrase. Sans elle, la détection
// existe en tant que code et ne se produit jamais.
const DEMARRE_LE = new Date()
const etatReconciliation = etatInitial()

const minuterie = setInterval(() => {
  void (async () => {
    const bilan = await unTour(pool, etatReconciliation)
    if (bilan !== null && bilan.ouverts > 0) {
      journal.log('warn', 'incidents ouverts par la réconciliation', { count: bilan.ouverts })
    }
    if (etatReconciliation.derniereErreur !== null) {
      journal.log('error', 'réconciliation en échec', { detail: etatReconciliation.derniereErreur })
    }
  })()
}, PERIODE_MS)
// Sans `unref`, cette minuterie empêcherait le processus de se terminer et
// transformerait chaque arrêt en attente de trente secondes puis en SIGKILL.
minuterie.unref()

const server = createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/health') {
    // 404 par RÈGLE, pas par oubli : aucune autre surface n'existe.
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not_found' }))
    return
  }

  void (async () => {
    try {
      const file = await stats(pool)
      const sante = evaluerSante(file)
      // Un détecteur arrêté ne produit pas d'erreur : il produit zéro
      // incident, ce qui ressemble exactement à « tout va bien ». La sonde doit
      // donc parler de LUI, pas seulement de ce qu'il trouve.
      const recon = evaluerReconciliation(etatReconciliation, new Date(), DEMARRE_LE)
      const raisons = recon.ok ? sante.raisons : [...sante.raisons, recon.raison ?? '']
      const statut = sante.status === 'ok' && recon.ok ? 'ok' : 'degraded'
      // Un worker vivant dont la file n'avance plus n'est PAS sain, et il doit
      // le dire lui-même — sinon la panne est invisible jusqu'à ce qu'un
      // utilisateur constate qu'on n'a rien fait pour lui de la nuit.
      res.writeHead(statut === 'ok' ? 200 : 503, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      res.end(JSON.stringify({
        status: statut,
        reasons: raisons,
        queue: file,
        reconciliation: {
          derniereReussite: etatReconciliation.derniereReussite?.toISOString() ?? null,
          toursReussis: etatReconciliation.toursReussis,
        },
      }))
    } catch (cause) {
      journal.erreur('sonde de santé indisponible', cause)
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'degraded', reasons: ['base injoignable'] }))
    }
  })()
})

const arreter = (signal: string): void => {
  journal.log('info', 'arrêt demandé', { source: signal })
  clearInterval(minuterie)
  server.close(() => {
    void pool.end().then(() => process.exit(0))
  })
}

process.on('SIGTERM', () => arreter('SIGTERM'))
process.on('SIGINT', () => arreter('SIGINT'))

// Une erreur non rattrapée est capturée AVANT que le processus meure : sans
// cela, la seule trace d'un worker mort la nuit est son absence.
process.on('uncaughtException', (cause) => {
  journal.erreur('exception non rattrapée', cause)
  process.exit(1)
})
process.on('unhandledRejection', (cause) => {
  journal.erreur('promesse rejetée sans traitement', cause)
})

server.listen(PORT, () => {
  journal.log('info', 'worker démarré', { statusCode: PORT })
})
