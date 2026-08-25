import { createServer } from 'node:http'

/**
 * The worker skeleton (ADR-0001).
 *
 * The boundary this file exists to make real: the worker holds NO user session
 * and exposes NO public route other than its own health probe. Everything it
 * will do — polling, generation, submission — arrives through JOB-009's queue,
 * never through an inbound request.
 */

const PORT = 3110

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }
  // Deliberate: no other surface exists. Not 404-as-oversight — 404 as a rule.
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not_found' }))
})

const shutdown = (signal: string) => {
  process.stdout.write(`worker: ${signal} received, closing\n`)
  server.close(() => process.exit(0))
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

server.listen(PORT, () => {
  process.stdout.write(`worker: health probe on http://localhost:${PORT}/health\n`)
})
