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
#  les mêmes conditions que Next.
#
#  « Les mêmes conditions » est à prendre au pied de la lettre, et ça a coûté
#  une heure : la sonde posait `exclusive: true`, ce qui la rendait PLUS STRICTE
#  que Next. Elle refusait donc des ports que Next aurait acceptés, et annonçait
#  « port tenu » alors que `lsof` ne voyait rien — un faux positif indiscernable
#  d'un vrai. Une sonde plus stricte que ce qu'elle protège ne mesure pas la
#  chose qu'elle prétend mesurer.
# =============================================================================
set -uo pipefail
PORT="${PORT_WEB:-3100}"

# `--input-type=module` : le script mêle `import` et `await` de premier niveau,
# et sans cette précision Node ne peut pas trancher entre CJS et ESM.
node --input-type=module -e '
import net from "node:net"
const port = Number(process.argv[1])

// Se lier puis relâcher, comme le fera Next : même famille d’adresses (`::`).
// On rend le CODE de l’erreur, jamais un simple « occupé » : la première
// version de ce script avalait toute erreur et concluait « port pris », ce qui
// a envoyé chercher un serveur fantôme pendant que la vraie cause était
// ailleurs. Un diagnostic qui affirme plus que ce qu’il a observé coûte plus
// cher que pas de diagnostic du tout.
const essai = () =>
  new Promise((resolve) => {
    const s = net.createServer()
    s.once("error", (e) => resolve(e.code ?? e.message))
    s.once("listening", () => s.close(() => resolve(null)))
    s.listen({ port, host: "::" })
  })

const dors = (ms) => new Promise((r) => setTimeout(r, ms))

let dernier = null
for (let i = 0; i < 40; i += 1) {
  dernier = await essai()
  if (dernier === null) process.exit(0)
  // Seul EADDRINUSE vaut la peine d’attendre : c’est le seul cas qui se règle
  // tout seul. Tout le reste est un défaut de configuration, et attendre vingt
  // secondes avant de le dire ne fait que retarder la réponse.
  if (dernier !== "EADDRINUSE") break
  await dors(500)
}

if (dernier === "EADDRINUSE") {
  console.error(`✗ le port ${port} est tenu depuis plus de 20 s — ce n’est pas une socket qui se libère.`)
  console.error(`  qui le tient :  lsof -nP -iTCP:${port}`)
} else {
  console.error(`✗ impossible de se lier au port ${port} : ${dernier}`)
  console.error("  Ce n’est PAS un port occupé. Traitez ce code d’erreur pour ce qu’il est.")
}
process.exit(1)
' "$PORT" || exit 1

exec pnpm --filter @job-seeker/web start
