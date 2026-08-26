import { createServer } from 'node:http'
import { readOptional } from '@job-seeker/env'
import { creerJournal, evaluerSante } from '@job-seeker/observability'
import pg from 'pg'
import { stats } from './queue/index.ts'

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
      // Un worker vivant dont la file n'avance plus n'est PAS sain, et il doit
      // le dire lui-même — sinon la panne est invisible jusqu'à ce qu'un
      // utilisateur constate qu'on n'a rien fait pour lui de la nuit.
      res.writeHead(sante.status === 'ok' ? 200 : 503, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      res.end(JSON.stringify({ status: sante.status, reasons: sante.raisons, queue: file }))
    } catch (cause) {
      journal.erreur('sonde de santé indisponible', cause)
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'degraded', reasons: ['base injoignable'] }))
    }
  })()
})

const arreter = (signal: string): void => {
  journal.log('info', 'arrêt demandé', { source: signal })
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
