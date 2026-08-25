#!/usr/bin/env bash
# =============================================================================
#  smoke.sh — exercer le logiciel comme un utilisateur le fait.
#
#  Une suite de tests verte n'est pas une vérification : c'est exactement ce à
#  quoi ressemblait l'échec que cette porte existe pour empêcher. Ce script
#  construit l'application, la démarre, et vérifie qu'une VRAIE page se rend et
#  qu'une VRAIE requête aboutit.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PORT=3100
LOG=".vantry/state/smoke.log"
mkdir -p "$(dirname "$LOG")"
PID=""

cleanup() {
  [ -n "$PID" ] && kill "$PID" 2>/dev/null
  [ -n "$PID" ] && wait "$PID" 2>/dev/null
  return 0
}
trap cleanup EXIT INT TERM

fail() { echo "  ✗ smoke: $1"; exit 1; }

echo "→ [smoke] build"
pnpm --filter @job-seeker/web build >"$LOG" 2>&1 || { tail -20 "$LOG"; fail "le build a échoué"; }

echo "→ [smoke] start"
pnpm --filter @job-seeker/web start >>"$LOG" 2>&1 &
PID=$!

echo "→ [smoke] ready"
for _ in $(seq 1 40); do
  if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then break; fi
  kill -0 "$PID" 2>/dev/null || { tail -20 "$LOG"; fail "le serveur est mort avant d'être prêt"; }
  sleep 0.5
done

BODY="$(curl -sf --max-time 5 "http://localhost:$PORT/api/health" || true)"
[ -n "$BODY" ] || { tail -20 "$LOG"; fail "/api/health n'a jamais répondu"; }
echo "$BODY" | grep -q '"status":"ok"' || fail "/api/health a répondu « $BODY », un utilisateur attend status:ok"

echo "→ [smoke] la page d'accueil se rend vraiment"
HTML="$(curl -sf --max-time 5 "http://localhost:$PORT/" || true)"
echo "$HTML" | grep -q "Le socle tient debout" \
  || fail "la page d'accueil ne contient pas son texte — un utilisateur verrait une page vide"
echo "$HTML" | grep -q "lang=\"fr\"" \
  || fail "la page ne déclare pas sa langue — lecteurs d'écran et césure cassés"

echo "→ [smoke] l'en-tête de sécurité est réellement servi"
curl -sfI --max-time 5 "http://localhost:$PORT/" | grep -qi "x-content-type-options: nosniff" \
  || fail "X-Content-Type-Options absent — next.config.ts le déclare mais il n'arrive pas"

echo "  ✓ smoke: la page se rend, l'API répond, les en-têtes sont servis"
