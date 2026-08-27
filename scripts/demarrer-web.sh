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
#  ── Pourquoi l'attente est longue ──
#
#  La cause a été mesurée, pas devinée : un ONGLET DE NAVIGATEUR ouvert sur
#  `localhost:3100` garde des connexions vers le serveur. Quand celui-ci
#  s'arrête, il doit les drainer avant de rendre sa socket d'écoute, et le
#  navigateur les rouvre entre-temps. Vingt secondes ne suffisaient pas ; la
#  vérification tombait alors en rouge sur une machine de développement dont
#  la seule faute était d'avoir l'application ouverte dans un onglet.
#
#  Une vérification qui échoue parce qu'on regarde le produit qu'elle vérifie
#  n'est pas une vérification, c'est une nuisance — et une nuisance finit
#  toujours par être contournée.
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
RACINE="$(cd "$(dirname "$0")/.." && pwd)"

# =============================================================================
#  Faucher NOTRE orphelin, et lui seul.
#
#  La trappe de nettoyage ci-dessous couvre TERM, INT et EXIT. Elle ne couvre
#  pas SIGKILL — rien ne le couvre, c'est ce que SIGKILL veut dire. Or
#  `verify.sh` finit par envoyer KILL quand TERM n'a pas suffi : le script meurt
#  sans exécuter sa trappe, et le `next-server` PETIT-FILS survit, réparenté à
#  init, en écoute sur le port. L'exécution suivante attend quatre-vingt-dix
#  secondes puis échoue en accusant un « serveur d'une exécution précédente » —
#  ce qu'il est, sans que personne ne puisse plus le rattacher à un parent.
#
#  Le nettoyage doit donc pouvoir se faire AU DÉMARRAGE, et c'est là que se
#  joue la seule difficulté : ne jamais tuer le serveur de quelqu'un d'autre.
#  Un balayage du port tuerait aussi bien le `next dev` d'un autre projet, ou
#  un service sans rapport qu'on aurait mis là.
#
#  Le critère retenu est donc double, et vérifié sur le processus lui-même :
#  c'est un `next-server`, ET son répertoire de travail est SOUS ce dépôt. Un
#  serveur d'un autre projet ne satisfait jamais la seconde condition.
#
#  « Sous », et pas « égal à » : le premier jet comparait à la racine et ne
#  trouvait jamais rien. `pnpm --filter @job-seeker/web start` lance Next depuis
#  `apps/web/`, donc c'est ce répertoire-là que porte le processus. Le test l'a
#  dit ; sans lui, la faucheuse aurait été un commentaire.
# =============================================================================
faucher_orphelin() {
  local pid cmd cwd
  for pid in $(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null); do
    cmd="$(ps -o command= -p "$pid" 2>/dev/null)"
    case "$cmd" in
      *next-server*|*"next start"*) ;;
      *) continue ;;
    esac
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
    case "$cwd" in
      "$RACINE"|"$RACINE"/*) ;;
      *) continue ;;
    esac
    echo "  · orphelin de ce dépôt sur le port $PORT (pid $pid) — fauché" >&2
    kill -KILL "$pid" 2>/dev/null
  done
}
faucher_orphelin

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
for (let i = 0; i < 180; i += 1) {
  dernier = await essai()
  if (dernier === null) process.exit(0)
  // Seul EADDRINUSE vaut la peine d’attendre : c’est le seul cas qui se règle
  // tout seul. Tout le reste est un défaut de configuration, et attendre vingt
  // secondes avant de le dire ne fait que retarder la réponse.
  if (dernier !== "EADDRINUSE") break
  await dors(500)
}

if (dernier === "EADDRINUSE") {
  console.error(`✗ le port ${port} est resté pris pendant 90 s.`)
  console.error("  La cause habituelle est un serveur précédent qui draine encore des connexions —")
  console.error("  souvent parce qu’un onglet de navigateur est ouvert sur l’application.")
  console.error(`  qui le tient :  lsof -nP -iTCP:${port}`)
  console.error(`  le libérer  :  kill $(lsof -nP -tiTCP:${port} -sTCP:LISTEN)`)
} else {
  console.error(`✗ impossible de se lier au port ${port} : ${dernier}`)
  console.error("  Ce n’est PAS un port occupé. Traitez ce code d’erreur pour ce qu’il est.")
}
process.exit(1)
' "$PORT" || exit 1

# ── Ne PAS `exec` : il faut pouvoir nettoyer derrière soi ──
#
# `verify.sh` arrête l'application en tuant le GROUPE de processus du pid
# qu'il a lancé. Cela suffisait jusqu'ici, mais `next start` place son serveur
# (`next-server`) dans un groupe A LUI : le kill de groupe ne l'atteint pas, il
# survit à la fin de la vérification, et c'est LUI qu'on retrouvait à tenir le
# port vingt secondes plus tard. Le message accusait alors « une socket qui se
# libère » — un serveur bien vivant.
#
# On garde donc la main : le fils tourne en arrière-plan, un piège attend
# l'arrêt, et l'on tue TOUTE la descendance en remontant l'arbre. `exec` aurait
# remplacé ce shell, et il n'y aurait plus personne pour le faire.
descendance() {
  local pere="$1" enfant
  for enfant in $(pgrep -P "$pere" 2>/dev/null); do
    descendance "$enfant"
    echo "$enfant"
  done
}

# Le nettoyage doit tenir dans la patience de l'appelant.
#
# `verify.sh` envoie TERM au groupe, attend DEUX secondes, puis envoie KILL.
# Une première version de ce nettoyage attendait trois secondes que Next
# s'arrête proprement — donc `verify` la tuait en plein travail, et le
# petit-fils survivait quand même. Un nettoyage plus lent que la patience de
# celui qui l'a déclenché n'est pas un nettoyage.
nettoyer() {
  local pids i=0
  pids="$(descendance "$FILS") $FILS"
  kill -TERM $pids 2>/dev/null
  while [ "$i" -lt 8 ] && kill -0 "$FILS" 2>/dev/null; do sleep 0.1; i=$((i + 1)); done
  kill -KILL $pids 2>/dev/null

  # Dernier recours : ce script est propriétaire de ce port pour la durée de la
  # vérification. Ce qui l'écoute encore ici est forcément quelque chose qu'on
  # a lancé et manqué — et le laisser condamne l'exécution suivante.
  local restant
  restant="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)"
  [ -n "$restant" ] && kill -KILL $restant 2>/dev/null
  return 0
}

trap nettoyer TERM INT EXIT

pnpm --filter @job-seeker/web start &
FILS=$!
wait "$FILS"
