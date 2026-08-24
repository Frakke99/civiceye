#!/usr/bin/env bash
# Smoketest tegen een echt Supabase-project. Werkt vanaf elke machine met curl,
# en bewijst in ~10 seconden dat het schema, de grants en RLS doen wat ze horen.
#
#   SUPABASE_URL=https://xxx.supabase.co \
#   SUPABASE_ANON_KEY=eyJ... \
#   ./scripts/smoke-api.sh
#
# Optioneel, om ook het schrijfpad te testen (zie QUICKSTART.md hoe je een
# anoniem JWT krijgt):
#   GC_JWT=eyJ... ./scripts/smoke-api.sh
set -uo pipefail

: "${SUPABASE_URL:?zet SUPABASE_URL, bv. https://xxx.supabase.co}"
: "${SUPABASE_ANON_KEY:?zet SUPABASE_ANON_KEY (de publieke anon key)}"

REST="${SUPABASE_URL%/}/rest/v1/rpc"
JWT="${GC_JWT:-$SUPABASE_ANON_KEY}"
fouten=0

rpc() { # rpc <functie> <json>
  curl -sS -X POST "$REST/$1" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d "$2"
}

ok()   { printf 'ok    — %s\n' "$1"; }
fout() { printf 'FOUT  — %s\n' "$1"; fouten=$((fouten + 1)); }

echo "→ project: $SUPABASE_URL"
echo

# --- 1. kaartquery, ingezoomd: moet losse meldingen geven -------------------
res="$(rpc map_reports '{"min_lng":4.30,"min_lat":51.15,"max_lng":4.55,"max_lat":51.30,"zoom":15}')"
if printf '%s' "$res" | grep -q '"is_cluster"'; then
  aantal="$(printf '%s' "$res" | grep -o '"is_cluster"' | wc -l | tr -d ' ')"
  ok "map_reports (zoom 15) geeft $aantal markers"
elif [ "$res" = "[]" ]; then
  ok "map_reports werkt, maar er staan nog geen meldingen in dit gebied"
  echo "        (laad db/seed/dev_seed.sql om testdata te krijgen)"
else
  fout "map_reports antwoordde onverwacht: $res"
fi

# --- 2. kaartquery, uitgezoomd: moet clusteren ------------------------------
res="$(rpc map_reports '{"min_lng":2.6,"min_lat":50.7,"max_lng":6.2,"max_lat":51.5,"zoom":8}')"
if printf '%s' "$res" | grep -qE '"is_cluster": *true'; then
  ok "map_reports (zoom 8) clustert server-side"
elif [ "$res" = "[]" ]; then
  ok "map_reports (zoom 8) werkt, nog geen data"
else
  fout "geen clusters bij zoom 8: $res"
fi

# --- 3. te groot venster moet geweigerd worden ------------------------------
res="$(rpc map_reports '{"min_lng":-180,"min_lat":-85,"max_lng":180,"max_lat":85,"zoom":2}')"
if printf '%s' "$res" | grep -q 'bbox_too_large'; then
  ok "een te groot kaartvenster wordt geweigerd (bbox_too_large)"
else
  fout "bbox_too_large werd niet afgedwongen: $res"
fi

# --- 4. nearby_reports -----------------------------------------------------
res="$(rpc nearby_reports '{"p_lat":51.2194,"p_lng":4.4025,"p_radius_m":100}')"
if printf '%s' "$res" | grep -qE '^\[' ; then
  ok "nearby_reports antwoordt"
else
  fout "nearby_reports faalde: $res"
fi

# --- 5. de anon key alléén mag NIET kunnen posten --------------------------
# Dit is de belangrijkste assertie: de anon key zit in elke app-bundle en is
# dus publiek. Wie hem heeft, mag lezen maar niet schrijven.
res="$(curl -sS -X POST "$REST/create_report" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_client_ref":"11111111-2222-3333-4444-555555555555","p_lat":51.22,"p_lng":4.40,"p_kind":"litter","p_size":"bag"}')"
if printf '%s' "$res" | grep -qiE 'permission denied|not_authenticated|PGRST202|42501'; then
  ok "posten met alleen de anon key wordt geweigerd"
else
  fout "LEK: de anon key kon posten → $res"
fi

# --- 6. de audittabel mag onleesbaar zijn ---------------------------------
res="$(curl -sS "${SUPABASE_URL%/}/rest/v1/report_audit?select=*&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $JWT")"
if [ "$res" = "[]" ] || printf '%s' "$res" | grep -qiE 'permission denied|42501|PGRST'; then
  ok "report_audit is niet leesbaar voor clients"
else
  fout "LEK: report_audit gaf data terug → $res"
fi

# --- 7. schrijfpad, alleen met een echt gebruikers-JWT --------------------
if [ -n "${GC_JWT:-}" ]; then
  ref="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)"
  res="$(rpc create_report "{\"p_client_ref\":\"$ref\",\"p_lat\":51.2194,\"p_lng\":4.4025,\"p_kind\":\"litter\",\"p_size\":\"bag\",\"p_note\":\"smoketest\",\"p_client\":\"web\"}")"
  if printf '%s' "$res" | grep -q '"report_id"'; then
    ok "create_report werkt met een gebruikers-JWT"
    # tweede keer met hetzelfde client_ref: moet idempotent zijn
    res2="$(rpc create_report "{\"p_client_ref\":\"$ref\",\"p_lat\":51.2194,\"p_lng\":4.4025,\"p_kind\":\"litter\",\"p_size\":\"bag\"}")"
    if printf '%s' "$res2" | grep -qE '"idempotent": *true'; then
      ok "dezelfde melding opnieuw posten is idempotent"
    else
      fout "idempotentie werkt niet: $res2"
    fi
  else
    fout "create_report faalde: $res"
  fi

  res="$(rpc create_report '{"p_client_ref":"99999999-8888-7777-6666-555555555555","p_lat":48.8566,"p_lng":2.3522,"p_kind":"litter","p_size":"bag"}')"
  if printf '%s' "$res" | grep -q 'outside_service_area'; then
    ok "een melding buiten het servicegebied wordt geweigerd"
  else
    fout "servicegebied werd niet afgedwongen: $res"
  fi
else
  echo "over   — schrijfpad (zet GC_JWT om create_report te testen)"
fi

echo
if [ "$fouten" -eq 0 ]; then
  echo "✓ alle checks geslaagd"
else
  echo "✗ $fouten check(s) gefaald"
fi
[ "$fouten" -eq 0 ]
