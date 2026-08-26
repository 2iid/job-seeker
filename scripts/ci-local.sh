#!/usr/bin/env bash
# =============================================================================
#  ci-local.sh — la CI, sans GitHub.
#
#  Écrit parce que le compte GitHub est verrouillé pour facturation et qu'aucun
#  job Actions ne démarre. Le kit dit que la CI est un accélérateur, pas la
#  garantie — mais elle apporte UNE chose que les hooks locaux n'apportent pas :
#  une exécution indépendante qui ne fait PAS confiance au reçu local.
#
#  Ce script reproduit cela : il clone la branche dans un répertoire propre et y
#  rejoue le contrat depuis zéro. Un reçu écrit sur votre arbre de travail n'y a
#  aucune valeur, exactement comme dans `verify.yml`.
#
#  Il rejoue les quatre jobs de .github/workflows/verify.yml plus le scan de
#  vulnérabilités, sous leurs noms d'affichage, pour que la sortie soit
#  comparable ligne à ligne avec ce que GitHub produira quand il repartira.
#
#  Usage: scripts/ci-local.sh [base-ref]     (défaut : merge.base de vantry.yml)
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=lib/vantry-common.sh
. scripts/lib/vantry-common.sh 2>/dev/null || { echo "✗ scripts/lib/vantry-common.sh introuvable"; exit 2; }

BASE="${1:-$(vantry_cfg merge.base 2>/dev/null || echo main)}"
HEAD_SHA="$(git rev-parse HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SLUG="$(printf '%s' "$BRANCH" | tr '/' '-' | tr -cd 'A-Za-z0-9._-')"
FAILED=""
WORK=""

cleanup() { [ -n "$WORK" ] && rm -rf "$WORK"; return 0; }
trap cleanup EXIT INT TERM

job()  { printf '\n\033[1m━━━ %s\033[0m\n' "$1"; }
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILED="$FAILED
  - $2"; }

printf '\033[1mci-local\033[0m — %s @ %s, base %s\n' "$BRANCH" "${HEAD_SHA:0:8}" "$BASE"
echo "GitHub Actions est indisponible ; ceci en est le substitut local, pas un raccourci."

# ---------------------------------------------------------------- 1. contrat
job "contract is valid"
if bash scripts/validate-config.sh >/dev/null 2>&1; then
  SMOKE="$(vantry_cfg run.smoke 2>/dev/null || true)"
  if [ -n "$SMOKE" ]; then pass "vantry.yml est valide et run.smoke est déclaré"
  else fail "run.smoke est vide — la vérification serait UNDEFINED" "contract is valid"; fi
else
  bash scripts/validate-config.sh 2>&1 | tail -6
  fail "vantry.yml ne passe pas validate-config" "contract is valid"
fi

# ------------------------------------------- 2. re-run, sur un arbre PROPRE
job "re-run the verification"
if [ -n "$(git status --porcelain)" ]; then
  echo "  ⚠ l'arbre de travail a des modifications non commitées ; seul le COMMIT est rejoué"
fi
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ci-local.XXXXXX")"
if git clone --quiet --shared --no-checkout "$ROOT" "$WORK/repo" 2>/dev/null \
   && git -C "$WORK/repo" checkout --quiet --detach "$HEAD_SHA" 2>/dev/null; then
  pass "clone propre à ${HEAD_SHA:0:8} — aucun reçu local n'y existe"
  if [ -d "$WORK/repo/.vantry/receipts" ]; then
    fail "un reçu a survécu au clone — il serait fait confiance à tort" "re-run the verification"
  fi
  # L'environnement est INJECTÉ dans le clone, exactement comme la CI injecte
  # ses secrets : ce qui doit être propre, c'est le CODE et l'absence de reçu,
  # pas la configuration. Sans cela on ne vérifierait que des pages d'erreur.
  if [ -f "$ROOT/.env" ]; then
    cp "$ROOT/.env" "$WORK/repo/.env"
    pass "environnement local injecté dans le clone (comme la CI injecte ses secrets)"
  else
    echo "  ⚠ aucun .env à injecter — l'application démarrera sans configuration"
  fi
  # Le clone tourne sur SES ports : sinon il dispute 3100 a l hote, echoue a se
  # lier, et l on croit a une regression du produit la ou il n y a qu une
  # collision. Les defauts restent 3100/3110 pour un lancement a la main.
  export PORT_WEB=3200 PORT_WORKER=3210
  pass "ports dedies au clone : web 3200, worker 3210"
  INSTALL="$(vantry_cfg run.install 2>/dev/null || true)"
  ( cd "$WORK/repo" && [ -n "$INSTALL" ] && eval "$INSTALL" ) >"$WORK/install.log" 2>&1
  if [ $? -ne 0 ]; then
    tail -12 "$WORK/install.log"
    fail "l'installation a échoué dans un arbre propre" "re-run the verification"
  else
    pass "install"
    ( cd "$WORK/repo" && bash scripts/verify.sh --ci ) >"$WORK/verify.log" 2>&1
    if [ $? -eq 0 ]; then
      pass "le contrat passe sur un arbre que rien n'a préparé"
      grep -E '^(→|✓) \[' "$WORK/verify.log" | sed 's/^/      /'
    else
      tail -20 "$WORK/verify.log" | sed 's/^/      /'
      fail "verify.sh --ci a échoué dans l'arbre propre" "re-run the verification"
    fi
  fi
else
  fail "impossible de cloner le dépôt dans un répertoire propre" "re-run the verification"
fi

# ------------------------------------------------------ 3. chemins sensibles
job "sensitive paths need a security review"
if ! git rev-parse --verify --quiet "$BASE" >/dev/null; then
  fail "base « $BASE » introuvable — je refuse d'annoncer un scan que je n'ai pas pu faire" "sensitive paths"
else
  HITS=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    vantry_is_sensitive "$f" && HITS="$HITS $f"
  done <<< "$(git diff --name-only "$BASE...HEAD")"
  if [ -z "$HITS" ]; then
    pass "aucun chemin sensible dans ce diff"
  else
    echo "  chemins sensibles touchés :"; for f in $HITS; do echo "      $f"; done
    R=".vantry/reviews/$SLUG.security.json"
    if [ ! -f "$R" ]; then
      fail "aucune revue de sécurité commitée en $R" "sensitive paths"
    else
      V="$(grep -o '"verdict"[[:space:]]*:[[:space:]]*"[a-z]*"' "$R" | head -1 | sed 's/.*"\([a-z]*\)"$/\1/')"
      RH="$(grep -o '"head"[[:space:]]*:[[:space:]]*"[0-9a-f]*"' "$R" | head -1 | sed 's/.*"\([0-9a-f]*\)"$/\1/')"
      if [ "$V" != "pass" ]; then fail "la revue de sécurité rend le verdict « $V »" "sensitive paths"
      elif [ -z "$RH" ]; then fail "la revue ne nomme pas le commit relu — un verdict sans commit ne vaut rien" "sensitive paths"
      elif ! git merge-base --is-ancestor "$RH" "$HEAD_SHA" 2>/dev/null; then
        fail "la revue porte sur $RH, qui n'est pas un ancêtre de ${HEAD_SHA:0:8}" "sensitive paths"
      else
        # La règle du job CI, reproduite : la revue n'a pas à porter sur le
        # commit de tête — elle doit en être un ancêtre ET aucun fichier
        # SENSIBLE ne doit avoir bougé depuis. Sinon le verdict décrit du code
        # qui n'est plus celui qu'on fusionne.
        LATE=""
        while IFS= read -r f; do
          [ -n "$f" ] || continue
          vantry_is_sensitive "$f" && LATE="$LATE $f"
        done <<< "$(git diff --name-only "$RH" "$HEAD_SHA")"
        if [ -n "$LATE" ]; then
          echo "  fichiers sensibles modifiés APRÈS la revue :"; for f in $LATE; do echo "      $f"; done
          fail "le verdict est périmé — refaire la revue" "sensitive paths"
        else
          pass "revue « pass » sur ${RH:0:8}, ancêtre de ${HEAD_SHA:0:8}, aucun changement sensible depuis"
        fi
      fi
    fi
  fi
fi

# ------------------------------------------------------- 4. vulnérabilités
job "known vulnerabilities"
if [ -x scripts/scan-vulns.sh ]; then
  if bash scripts/scan-vulns.sh >"$WORK/vulns.log" 2>&1; then
    pass "aucune vulnérabilité bloquante"
  else
    tail -14 "$WORK/vulns.log" | sed 's/^/      /'
    fail "scan-vulns.sh a signalé un problème bloquant" "known vulnerabilities"
  fi
else
  fail "scripts/scan-vulns.sh absent" "known vulnerabilities"
fi

# ------------------------------------------------------------------ verdict
printf '\n'
if [ -z "$FAILED" ]; then
  printf '\033[32m✓ ci-local : tous les jobs passent\033[0m sur %s @ %s\n' "$BRANCH" "${HEAD_SHA:0:8}"
  echo "  Ce n'est PAS un tampon GitHub. Quand la facturation sera réglée, la même"
  echo "  chose tournera chez eux et devra redonner le même verdict."
  exit 0
fi
printf '\033[31m✗ ci-local : job(s) en échec\033[0m%s\n' "$FAILED"
exit 1
