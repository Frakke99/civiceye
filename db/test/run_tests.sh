#!/usr/bin/env bash
# Voert alle migraties + smoketests uit tegen een wegwerpdatabank.
# Vereist: een lopende Postgres met PostGIS en een superuser-verbinding.
#
#   ./db/test/run_tests.sh                 # gebruikt PGDATABASE=gc_test
#   DB=mijntest ./db/test/run_tests.sh
#
# In CI: zie .github/workflows/ci.yml (postgis/postgis service container).
set -euo pipefail

DB="${DB:-gc_test}"
PSQL=(psql -v ON_ERROR_STOP=1 --no-psqlrc -q)

echo "→ databank $DB opnieuw aanmaken"
dropdb --if-exists "$DB"
createdb "$DB"

echo "→ Supabase-stubs (alleen lokaal/CI)"
"${PSQL[@]}" -d "$DB" -f db/test/00_supabase_stubs.sql

for f in db/migrations/*.sql; do
  echo "→ migratie $(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

echo "→ smoketests"
"${PSQL[@]}" -d "$DB" -f db/test/10_tests.sql 2>&1 | grep -E "^(NOTICE|ERROR|psql)" || true

echo "→ tests opnieuw, nu hard falend bij de eerste fout"
"${PSQL[@]}" -d "$DB" -f db/test/10_tests.sql > /dev/null

echo "✓ alle migraties en tests geslaagd op $DB"
