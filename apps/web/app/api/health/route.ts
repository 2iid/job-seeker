import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Readiness, not liveness: it answers only when the process can actually serve.
 * It deliberately reports NO version, no build id and no dependency detail —
 * this endpoint is public on a public deployment.
 */
export function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
}
