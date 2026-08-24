#!/usr/bin/env bash
# Test scripts/smoke-api.sh tegen een nagemaakte Supabase-API.
#
# Waarom dit bestaat: smoke-api.sh moet beveiligingsfouten vinden (een anon key
# die kan posten, een leesbare audittabel). Een smoketest die per ongeluk altijd
# "ok" zegt, is gevaarlijker dan geen smoketest. Dus testen we hier beide
# richtingen: hij moet slagen op een correct project én falen op een lek project.
#
#   ./scripts/test-smoke-api.sh
set -uo pipefail

command -v python3 >/dev/null || { echo "python3 nodig"; exit 1; }

PORT_OK=${PORT_OK:-8801}
PORT_LEK=${PORT_LEK:-8802}

python3 scripts/fake-supabase.py healthy "$PORT_OK" &
PID_OK=$!
python3 scripts/fake-supabase.py leaky "$PORT_LEK" &
PID_LEK=$!
trap 'kill $PID_OK $PID_LEK 2>/dev/null' EXIT

# wachten tot de nagemaakte servers luisteren
for _ in $(seq 1 30); do
  if python3 -c "
import socket,sys
for p in ($PORT_OK, $PORT_LEK):
    s=socket.socket()
    s.settimeout(0.2)
    try: s.connect(('127.0.0.1', p))
    except Exception: sys.exit(1)
    finally: s.close()
" 2>/dev/null; then break; fi
  sleep 0.2
done

fouten=0

echo "=== 1. correct geconfigureerd project → moet slagen ==="
if SUPABASE_URL="http://127.0.0.1:$PORT_OK" SUPABASE_ANON_KEY=anonkey CIVICEYE_JWT=USERJWT \
     ./scripts/smoke-api.sh; then
  echo "ok — smoke-api slaagt op een correct project"
else
  echo "FOUT — smoke-api faalt op een correct project (valse alarmen)"
  fouten=$((fouten + 1))
fi

echo
echo "=== 2. project met verkeerde grants → moet falen ==="
uitvoer="$(SUPABASE_URL="http://127.0.0.1:$PORT_LEK" SUPABASE_ANON_KEY=anonkey \
             ./scripts/smoke-api.sh 2>&1)"
status=$?
echo "$uitvoer"
if [ "$status" -ne 0 ] \
   && printf '%s' "$uitvoer" | grep -q "LEK: de anon key kon posten" \
   && printf '%s' "$uitvoer" | grep -q "LEK: report_audit gaf data terug"; then
  echo "ok — smoke-api vindt beide lekken en faalt met exitcode $status"
else
  echo "FOUT — smoke-api miste een lek (exitcode $status)"
  fouten=$((fouten + 1))
fi

echo
[ "$fouten" -eq 0 ] && echo "✓ smoke-api.sh gedraagt zich in beide richtingen correct"
[ "$fouten" -eq 0 ]
