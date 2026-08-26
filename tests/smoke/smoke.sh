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
PORT_WORKER=3110
LOG=".vantry/state/smoke.log"
mkdir -p "$(dirname "$LOG")"
PID=""
PID_WORKER=""

cleanup() {
  for p in "$PID" "$PID_WORKER"; do
    [ -n "$p" ] && kill "$p" 2>/dev/null
    [ -n "$p" ] && wait "$p" 2>/dev/null
  done
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

echo "→ [smoke] le système de design atteint vraiment le navigateur"
CSS_HREF="$(printf '%s' "$HTML" | grep -o '/_next/static/css/[^"]*\.css' | head -1)"
[ -n "$CSS_HREF" ] || fail "aucune feuille de style liée dans la page — les tokens ne partent pas"
CSS="$(curl -sf --max-time 5 "http://localhost:$PORT$CSS_HREF" || true)"
echo "$CSS" | grep -q -- '--accent-machine' \
  || fail "la feuille servie ne contient pas --accent-machine : le système n'est pas câblé"
echo "$CSS" | grep -q 'prefers-color-scheme:dark\|prefers-color-scheme: dark' \
  || fail "aucun bloc sombre dans la feuille servie — la parité des thèmes n'arrive pas au navigateur"
echo "$CSS" | grep -q 'prefers-reduced-motion' \
  || fail "prefers-reduced-motion absent de la feuille servie"

echo "→ [smoke] l'en-tête de sécurité est réellement servi"
curl -sfI --max-time 5 "http://localhost:$PORT/" | grep -qi "x-content-type-options: nosniff" \
  || fail "X-Content-Type-Options absent — next.config.ts le déclare mais il n'arrive pas"

# ---------------------------------------------------------------------------
#  Le worker. Il porte la boucle autonome : sa sonde doit distinguer « vivant »
#  de « sain », sinon une file bloquée passe pour un service en bonne santé.
# ---------------------------------------------------------------------------
echo "→ [smoke] une page protégée renvoie vers la connexion"
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT/profil")"
[ "$CODE" = "307" ] || [ "$CODE" = "302" ] \
  || fail "/profil a répondu $CODE sans session — une page protégée doit rediriger"
CIBLE="$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 5 "http://localhost:$PORT/profil")"
printf '%s' "$CIBLE" | grep -q "/connexion" \
  || fail "/profil redirige vers « $CIBLE » au lieu de la connexion"

echo "→ [smoke] la redirection ouverte est refusée"
OUVERTE="$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 5 "http://localhost:$PORT/auth/callback?next=https%3A%2F%2Fevil.example")"
printf '%s' "$OUVERTE" | grep -q "evil.example" \
  && fail "le callback a suivi une destination externe : REDIRECTION OUVERTE"

echo "→ [smoke] le worker démarre et répond"
pnpm --filter @job-seeker/worker dev >>"$LOG" 2>&1 &
PID_WORKER=$!
for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PORT_WORKER/health" >/dev/null 2>&1 && break
  kill -0 "$PID_WORKER" 2>/dev/null || { tail -20 "$LOG"; fail "le worker est mort avant d'être prêt"; }
  sleep 0.5
done
SANTE="$(curl -sf --max-time 5 "http://localhost:$PORT_WORKER/health" || true)"
echo "$SANTE" | grep -q '"status":"ok"' \
  || fail "le worker ne se déclare pas sain : « $SANTE » (la base locale tourne-t-elle ?)"
echo "$SANTE" | grep -q '"queue"' \
  || fail "la sonde ne rapporte pas l'état de la file — vivant serait confondu avec sain"

echo "→ [smoke] le worker n'expose RIEN d'autre que sa sonde"
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT_WORKER/jobs" || true)"
[ "$CODE" = "404" ] \
  || fail "le worker a répondu $CODE sur /jobs — il ne doit avoir aucune autre surface"

echo "  ✓ smoke: la page se rend, l'API répond, les tokens des deux thèmes sont servis," 
echo "           les en-têtes aussi, et le worker rend compte de sa file sans rien exposer d'autre"
