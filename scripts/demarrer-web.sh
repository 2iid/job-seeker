#!/usr/bin/env bash
# =============================================================================
#  demarrer-web.sh — attendre que le port soit RÉELLEMENT libre, puis démarrer.
#
#  Deux exécutions de verify.sh qui se suivent se marchent dessus : la première
#  tue son serveur, le noyau garde la socket un instant, et la seconde part en
#  EADDRINUSE. Next écrit alors son erreur dans le journal et rend la main — le
#  contrat croit avoir démarré, puis le smoke trouve un port pris qui ne répond
#  pas, et le message accuse un serveur fantôme qui n'existe plus.
#
#  La première version de ce script interrogeait `lsof`. Ça ne suffisait pas :
#  lsof rendait le port libre alors que Next échouait quand même dessus — une
#  socket en cours de libération, sur `::` plutôt que sur une adresse, ne se
#  présente pas de la même façon selon qui regarde.
#
#  On ne DEMANDE donc plus si le port est libre : on ESSAIE DE S'Y LIER, dans
#  les mêmes conditions que Next. Un test qui reproduit exactement l'opération
#  qu'on veut protéger ne peut pas se tromper sur ce qu'il mesure.
# =============================================================================
set -uo pipefail
PORT="${PORT_WEB:-3100}"

# `--input-type=module` : le script mêle `import` et `await` de premier niveau,
# et sans cette précision Node ne peut pas trancher entre CJS et ESM.
node --input-type=module -e '
import net from "node:net"
const port = Number(process.argv[1])

// Se lier puis relâcher, comme le fera Next : même famille d’adresses (`::`),
// même exclusivité. Si ceci passe, Next passera.
const essai = () =>
  new Promise((resolve) => {
    const s = net.createServer()
    s.once("error", () => resolve(false))
    s.once("listening", () => s.close(() => resolve(true)))
    s.listen({ port, host: "::", exclusive: true })
  })

const dors = (ms) => new Promise((r) => setTimeout(r, ms))

for (let i = 0; i < 40; i += 1) {
  if (await essai()) process.exit(0)
  await dors(500)
}
console.error(`✗ le port ${port} est tenu depuis plus de 20 s — ce n’est pas une socket qui se libère.`)
console.error(`  qui le tient :  lsof -nP -iTCP:${port}`)
console.error(`  le libérer  :  kill $(lsof -nP -tiTCP:${port} -sTCP:LISTEN)`)
process.exit(1)
' "$PORT" || exit 1

exec pnpm --filter @job-seeker/web start
