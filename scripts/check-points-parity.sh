#!/usr/bin/env bash
# Vergelijkt packages/shared/src/points.ts met de SQL-functie public.points_for.
#
# De server kent de punten toe; de TS-versie bestaat alleen om ze vooraf te
# tónen ("dit levert 5 punten op"). Twee bronnen voor dezelfde regel groeien
# stil uit elkaar, dus vergelijken we ze bij elke commit.
#
#   DB=civiceye_test ./scripts/check-points-parity.sh
set -euo pipefail

DB="${DB:-civiceye_test}"

# Type-stripping van .ts-bestanden vraagt Node 22.6+.
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "Node 22+ nodig voor deze check (gevonden: $(node -v))" >&2
  exit 1
fi

# --- waarden uit de databank ---
psql -tAq -d "$DB" -c "
  select k.kind || ',' || coalesce(s.size::text, 'null') || ',' ||
         public.points_for(k.kind, s.size)
  from (select unnest(enum_range(null::public.report_kind)) as kind) k
  cross join (select unnest(enum_range(null::public.litter_size)) as size
              union all select null) s
  order by 1
" | sed '/^$/d' > /tmp/points-sql.csv

# --- waarden uit TypeScript ---
# Node 22 strippt types voor .ts-bestanden, dus dit heeft geen bundler nodig.
node --no-warnings scripts/points-table.ts | sed '/^$/d' > /tmp/points-ts.csv

if diff -u /tmp/points-sql.csv /tmp/points-ts.csv; then
  echo "✓ punten in SQL en TypeScript zijn identiek ($(wc -l < /tmp/points-ts.csv) combinaties)"
else
  echo "✗ points_for (SQL) en pointsFor (TypeScript) lopen uit elkaar"
  echo "  De databank is de bron van waarheid — pas packages/shared/src/points.ts aan."
  exit 1
fi
