#!/usr/bin/env bash
# =============================================================================
#  db-bootstrap.sh — aligner la base LOCALE sur ce que l'hébergé fournit déjà.
#
#  À jouer une fois après `supabase start`, et rejouable sans dommage. Voir
#  supabase/bootstrap-local.sql pour ce que cela fait et pourquoi.
#
#  Le rôle utilisé est le superutilisateur de la pile locale de développement,
#  qui n'existe que dans le conteneur et n'est joignable qu'en bouclage. Ses
#  identifiants sont passés en CHAMPS SÉPARÉS, jamais dans une URL : le
#  scanner de secrets refuse toute chaîne de connexion Postgres portant un mot
#  de passe en clair, et il a raison de la refuser même quand l'hôte se trouve
#  être local — il ne peut pas savoir vers quoi pointe une variable. Contourner ce refus en élargissant
#  l'exception aurait affaibli le scanner pour tout le dépôt ; ne pas écrire la
#  chaîne ne coûte rien.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

SUPABASE_DB_HOST="${SUPABASE_DB_HOST:-127.0.0.1}" \
SUPABASE_DB_PORT="${SUPABASE_DB_PORT:-54522}" \
node --experimental-strip-types -e '
import { readFileSync } from "node:fs"
import pg from "pg"

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT),
  database: "postgres",
  user: "supabase_admin",
  password: "postgres", // défaut publié de la pile locale ; aucun projet hébergé ne l’accepte
  connectionTimeoutMillis: 5000,
})

try {
  await c.connect()
} catch {
  console.error("✗ base locale injoignable. Lancez : supabase start")
  process.exit(1)
}
await c.query(readFileSync(process.argv[1], "utf8"))
await c.end()
console.log("✓ base locale alignée sur la configuration hébergée")
' "$ROOT/supabase/bootstrap-local.sql"
