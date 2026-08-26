#!/usr/bin/env bash
# Régénère supabase/schema.sql — la forme lisible du schéma, versionnée à chaque
# migration. Sert à deux choses : relire un changement de structure dans un diff
# de PR plutôt que dans un fichier de migration, et garder une sortie possible
# du fournisseur (ADR-0001).
set -uo pipefail
cd "$(dirname "$0")/.."
supabase db dump --local -f supabase/schema.sql >/dev/null 2>&1 || {
  echo "✗ export impossible — la pile locale tourne-t-elle ? (supabase start)"; exit 1; }
echo "✓ supabase/schema.sql régénéré ($(wc -l < supabase/schema.sql | tr -d ' ') lignes)"
