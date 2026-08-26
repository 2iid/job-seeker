#!/usr/bin/env bash
# =============================================================================
#  demarrer-web.sh — attendre que le port soit rendu, puis démarrer.
#
#  Deux exécutions de verify.sh qui se suivent se marchent dessus : la première
#  tue son serveur, mais le noyau garde la socket quelques centaines de
#  millisecondes, et la seconde échoue sur EADDRINUSE. Next écrit alors son
#  erreur dans le journal et rend la main — le contrat croit avoir démarré,
#  puis le smoke trouve un port pris qui ne répond pas.
#
#  Le symptôme ment sur la cause : on lit « le port 3100 est déjà pris » et on
#  cherche un serveur fantôme qui n'existe plus. D'où cette attente explicite,
#  bornée : si au bout de 20 s le port est encore tenu, c'est un VRAI serveur,
#  et on le dit avec la commande pour le libérer plutôt que d'échouer en
#  EADDRINUSE trois étapes plus loin.
# =============================================================================
set -uo pipefail
PORT="${PORT_WEB:-3100}"

for _ in $(seq 1 40); do
  lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 0.5
done

if lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✗ le port $PORT est tenu depuis plus de 20 s — ce n'est pas une socket qui se libère." >&2
  echo "  qui le tient :  lsof -nP -iTCP:$PORT -sTCP:LISTEN" >&2
  echo "  le libérer  :  kill \$(lsof -nP -tiTCP:$PORT -sTCP:LISTEN)" >&2
  exit 1
fi

exec pnpm --filter @job-seeker/web start
