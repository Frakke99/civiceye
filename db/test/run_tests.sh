#!/usr/bin/env bash
# Voert alle migraties + smoketests uit tegen een wegwerpdatabank.
# Vereist: een lopende Postgres met PostGIS en een superuser-verbinding.
#
#   ./db/test/run_tests.sh                 # gebruikt PGDATABASE=civiceye_test
#   DB=mijntest ./db/test/run_tests.sh
#
# In CI: zie .github/workflows/ci.yml (postgis/postgis service container).
set -euo pipefail

DB="${DB:-civiceye_test}"
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

# De opschaalstap is voorgeschreven maar nog niet actief; hij moet wel op
# elke schemaversie blijven passen én dezelfde aantallen geven als de live
# query. Seed eerst, want de pariteitstest vergelijkt op echte data.
echo "→ opschaalstap: seed + cluster-cache + pariteit"
"${PSQL[@]}" -d "$DB" -f db/seed/dev_seed.sql > /dev/null
"${PSQL[@]}" -d "$DB" -f db/scale/0100_cluster_cache.sql > /dev/null
"${PSQL[@]}" -d "$DB" -f db/test/30_cluster_cache.sql 2>&1 | grep -E "^(NOTICE|ERROR|psql)" || true
"${PSQL[@]}" -d "$DB" -f db/test/30_cluster_cache.sql > /dev/null

echo "✓ alle migraties en tests geslaagd op $DB"
