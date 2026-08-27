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

# Parametrables : la contre-verification sur clone propre tourne en meme temps
# que l hote et ne doit pas lui disputer un port. Un service qui echoue a se
# lier produit un smoke qui teste le serveur du voisin.
PORT="${PORT_WEB:-3100}"
PORT_WORKER="${PORT_WORKER:-3110}"
LOG=".vantry/state/smoke.log"
mkdir -p "$(dirname "$LOG")"
PID=""
PID_WORKER=""

# Tuer le processus lance par pnpm ne tue PAS le serveur qu il a engendre :
# pnpm est un pere, next start est le fils, et le fils garde le port. Chaque
# execution laissait donc un serveur derriere elle, et la suivante mourait sur
# un EADDRINUSE incomprehensible. On tue l arbre, puis on attend que le port
# soit reellement rendu.
cleanup() {
  for p in "$PID" "$PID_WORKER"; do
    [ -n "$p" ] || continue
    pkill -P "$p" 2>/dev/null
    kill "$p" 2>/dev/null
    wait "$p" 2>/dev/null
  done
  for port in "$PORT" "$PORT_WORKER"; do
    for _ in $(seq 1 20); do
      lsof -nP -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 || break
      sleep 0.25
    done
  done
  return 0
}

port_libre() {
  lsof -nP -tiTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1 && {
    echo "  ✗ smoke: le port $1 est déjà pris. Un serveur d'une exécution précédente ?"
    echo "     libérez-le :  kill \$(lsof -nP -tiTCP:$1 -sTCP:LISTEN)"
    exit 1
  }
  return 0
}
trap cleanup EXIT INT TERM

fail() { echo "  ✗ smoke: $1"; exit 1; }

# vantry.yml declare `start` et `ready` : quand ce script est lance par
# verify.sh, l application TOURNE DEJA. En demarrer une seconde sur le meme
# port faisait echouer silencieusement la notre, pendant que nos requetes
# touchaient en realite le serveur du contrat — un smoke qui n exerçait pas ce
# qu il croyait exercer. On adopte donc le serveur en place s il repond, et on
# n en demarre un que s il n y en a pas. On ne tue que ce qu on a demarre.
adopte_ou_demarre() {   # $1 = port, $2 = sonde, $3 = commande, $4 = nom de variable de pid
  if curl -sf --max-time 2 "$2" >/dev/null 2>&1; then
    echo "  · serveur deja en place sur $1 (demarre par le contrat) — adopte"
    return 0
  fi
  port_libre "$1"
  eval "$3" >>"$LOG" 2>&1 &
  eval "$4=$!"
  for _ in $(seq 1 40); do
    curl -sf --max-time 2 "$2" >/dev/null 2>&1 && return 0
    kill -0 "$(eval echo \$$4)" 2>/dev/null || { tail -20 "$LOG"; fail "le service sur $1 est mort avant d etre pret"; }
    sleep 0.5
  done
  fail "le service sur $1 n a jamais repondu"
}

echo "→ [smoke] build"
pnpm --filter @job-seeker/web build >"$LOG" 2>&1 || { tail -20 "$LOG"; fail "le build a échoué"; }

echo "→ [smoke] l application repond"
adopte_ou_demarre "$PORT" "http://localhost:$PORT/api/health" \
  "pnpm --filter @job-seeker/web start" PID

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

echo "→ [smoke] le theme est pose AVANT la premiere peinture"
printf '%s' "$HTML" | grep -q "data-theme" \
  || fail "le script de theme n'est pas dans le HTML servi — clignotement garanti en mode sombre"
printf '%s' "$HTML" | grep -q "prefers-color-scheme" \
  || fail "le script servi ne consulte pas la preference systeme"

echo "→ [smoke] l'en-tête de sécurité est réellement servi"
curl -sfI --max-time 5 "http://localhost:$PORT/" | grep -qi "x-content-type-options: nosniff" \
  || fail "X-Content-Type-Options absent — next.config.ts le déclare mais il n'arrive pas"

# ---------------------------------------------------------------------------
#  Le worker. Il porte la boucle autonome : sa sonde doit distinguer « vivant »
#  de « sain », sinon une file bloquée passe pour un service en bonne santé.
# ---------------------------------------------------------------------------
echo "→ [smoke] toute page protégée renvoie vers la connexion"
# La liste est explicite, et chaque nouvelle page protégée s'y ajoute. Une
# vérification qui ne teste que /profil laisserait passer un écran ajouté plus
# tard — et c'est le dernier écran ajouté qui oublie la garde, pas le premier.
for CHEMIN in /profil /profil/import /criteres /opportunites /entree /approbations /recus; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT$CHEMIN")"
  [ "$CODE" = "307" ] || [ "$CODE" = "302" ] \
    || fail "$CHEMIN a répondu $CODE sans session — une page protégée doit rediriger"
  CIBLE="$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 5 "http://localhost:$PORT$CHEMIN")"
  printf '%s' "$CIBLE" | grep -q "/connexion" \
    || fail "$CHEMIN redirige vers « $CIBLE » au lieu de la connexion"
done

# JOB-053 / US-01 — l'arrêt d'urgence est un bouton, sur TOUTE page servie.
# Un bouton présent sur neuf écrans sur dix est un bouton qu'on cherchera sur
# le dixième, et REQ-012 dit « depuis n'importe quel écran ».
# JOB-056 — les routes d'EXPORT ne sont pas des pages : elles ne redirigent pas,
# elles doivent simplement ne rien rendre. Une redirection vers la connexion
# serait acceptable pour un humain et trompeuse pour un script, qui la suivrait
# et enregistrerait une page HTML sous le nom d'un reçu.
echo "→ [smoke] les exports de reçus ne rendent rien sans session"
for CHEMIN in "/recus/export" "/recus/00000000-0000-0000-0000-000000000000/export"; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT$CHEMIN")"
  case "$CODE" in
    200) fail "$CHEMIN a rendu 200 SANS SESSION — un export de reçus est accessible à tous" ;;
    30[1237]|401|404) ;;
    *) fail "$CHEMIN a répondu $CODE — attendu un refus" ;;
  esac
done

echo "→ [smoke] l arrêt d urgence est atteignable, et en premier"
PAGE="$(curl -s --max-time 5 "http://localhost:$PORT/connexion")"
printf '%s' "$PAGE" | grep -q "Tout arrêter" \
  || fail "aucun bouton d arrêt d urgence sur /connexion"
# « ≤ 2 Tab » : le bouton doit précéder tout autre élément FOCALISABLE.
#
# Un `<input type="hidden">` n'est pas focalisable, et Next en pose un au tout
# début de chaque formulaire d'action serveur — y compris celui du bouton
# d'arrêt lui-même. Comparer au premier `<input>` venu faisait donc échouer un
# ordre pourtant correct : le contrôle mesurait le balisage, pas ce que la
# touche Tab atteint.
POS_ARRET=$(printf '%s' "$PAGE" | grep -bo "Tout arrêter" | head -1 | cut -d: -f1)
POS_CHAMP=$(printf '%s' "$PAGE" | grep -o '<input[^>]*>' | grep -v 'type="hidden"' | head -1)
if [ -n "$POS_CHAMP" ]; then
  POS_CHAMP=$(printf '%s' "$PAGE" | grep -bo -- "$POS_CHAMP" | head -1 | cut -d: -f1)
  if [ -n "$POS_ARRET" ] && [ -n "$POS_CHAMP" ] && [ "$POS_ARRET" -gt "$POS_CHAMP" ]; then
    fail "l arrêt d urgence n est pas le premier élément focalisable (US-01 : ≤ 2 Tab)"
  fi
fi

# JOB-073 / F9 / F10 — la limitation de débit, vue de l'extérieur.
#
# C'est le seul endroit où les DEUX propriétés se contrôlent ensemble, parce
# qu'elles se contredisent : F9 veut une limite par adresse, F10 veut qu'on ne
# puisse rien apprendre de la réponse. Une limite par adresse mal posée répond
# différemment pour une adresse inscrite — et devient l'oracle qu'elle devait
# protéger.
echo "→ [smoke] /auth/lien répond identiquement, inscrit ou non"
# Une IP simulée, DIFFÉRENTE à chaque exécution.
#
# Sans cela ce contrôle s'auto-bloque : le plafond par IP court sur une heure et
# la base survit au smoke, donc la deuxième exécution de la journée échouait sur
# le quota de la première. Un contrôle qu'on ne peut lancer que deux fois par
# heure n'est pas un contrôle. (C'est cet échec qui a fait relever le plafond
# par IP : il montrait gratuitement ce qui attend un NAT partagé.)
#
# Poser soi-même x-forwarded-for ne marche ICI que parce qu'aucun proxy réel
# n'est devant le serveur local. En production, adresseAppelante() ne lit que
# l'entrée écrite par NOTRE relais, et refuse tout quand il n'y en a aucun ;
# apps/web/lib/limitation/adresse-ip.test.ts couvre les deux cas.
IP_SIMULEE="198.51.100.$(( ($$ % 250) + 1 ))"
reponse_lien() {  # $1 = adresse ; rend "code|destination"
  curl -s -o /dev/null -w '%{http_code}|%{redirect_url}' --max-time 5 \
    -H "X-Forwarded-For: $IP_SIMULEE" \
    -X POST "http://localhost:$PORT/auth/lien" \
    --data-urlencode "email=$1" --data-urlencode "next=/tableau"
}
# CE QUE CE CONTRÔLE PROUVE, ET CE QU'IL NE PROUVE PAS.
#
# Il compare deux adresses INCONNUES. Il ne compare pas une inscrite à une
# inconnue : le smoke n'a pas d'accès à la base, et lui donner la clé de service
# pour fabriquer un compte mettrait un secret dans le seul script qui tourne
# partout — mauvais échange pour ce qu'on y gagnerait.
#
# La preuve « inscrite = inconnue » est donc STRUCTURELLE, et elle est plus
# forte qu'une comparaison : la route ne récupère jamais le résultat de
# `signInWithOtp` et n'a qu'une seule destination de succès, donc il n'existe
# aucun chemin par lequel elle POURRAIT différer. `tests/auth/oracle-inscription
# .test.ts` garde ces deux propriétés sur la source.
#
# Ce que ce contrôle ajoute, et que la lecture ne donne pas : que la limitation
# de débit, ajoutée par-dessus, n'a pas introduit la différence — c'était le
# risque réel de JOB-073.

A="$(reponse_lien "inexistant-$$@smoke.test")"
B="$(reponse_lien "autre-inexistant-$$@smoke.test")"
[ "$A" = "$B" ] || fail "/auth/lien répond différemment selon l adresse : [$A] vs [$B]"
printf '%s' "$A" | grep -q "^303|" || fail "/auth/lien ne redirige pas (obtenu : $A)"
printf '%s' "$A" | grep -q "envoye=1" || fail "/auth/lien ne confirme pas l envoi (obtenu : $A)"

echo "→ [smoke] la limitation de débit se déclenche, et ne dit pas laquelle"
# Le plafond par adresse est 5 sur 15 minutes. La 6e demande sur la MÊME
# adresse doit être refusée — et le refus ne doit nommer aucune portée.
LIM="smoke-limite-$$@smoke.test"
for _ in 1 2 3 4 5; do reponse_lien "$LIM" >/dev/null; done
SIXIEME="$(reponse_lien "$LIM")"
printf '%s' "$SIXIEME" | grep -q "trop-de-demandes" \
  || fail "la 6e demande sur la même adresse n a pas été limitée (obtenu : $SIXIEME)"
printf '%s' "$SIXIEME" | grep -qiE "adresse=|ip=|portee=" \
  && fail "le refus de limitation nomme la portée : c est l oracle que F10 interdit"
# Et le refus doit rester un 303 comme tous les autres chemins : un 429 ici se
# distinguerait à l œil nu dans l onglet réseau.
printf '%s' "$SIXIEME" | grep -q "^303|" \
  || fail "le refus de limitation ne ressemble pas aux autres réponses (obtenu : $SIXIEME)"

echo "→ [smoke] la redirection ouverte est refusée"
OUVERTE="$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 5 "http://localhost:$PORT/auth/callback?next=https%3A%2F%2Fevil.example")"
printf '%s' "$OUVERTE" | grep -q "evil.example" \
  && fail "le callback a suivi une destination externe : REDIRECTION OUVERTE"

echo "→ [smoke] le worker démarre et répond"
adopte_ou_demarre "$PORT_WORKER" "http://localhost:$PORT_WORKER/health" \
  "pnpm --filter @job-seeker/worker dev" PID_WORKER
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
