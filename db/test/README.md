# Databasetests

De migraties in `db/migrations/` zijn geschreven voor Supabase, maar testbaar op
een gewone Postgres met PostGIS — zonder Supabase-project en zonder netwerk.
Dat is opzettelijk: de beveiligingsregels van dit product (RLS, rate limits,
statusovergangen, moderatie) zitten in de databank, en die moeten bij elke
commit opnieuw bewezen worden.

## Vereisten

- Postgres 15 of 16 met PostGIS 3.x
- `psql` met een superuser-verbinding (voor `create extension` en `set role`)

## Draaien

```bash
./db/test/run_tests.sh              # databank civiceye_test
DB=mijn_test ./db/test/run_tests.sh # eigen naam
```

Het script maakt de databank opnieuw aan, laadt de stubs, past alle migraties
toe en draait de smoketests. Alles loopt twee keer: één keer met leesbare
`ok —`-meldingen, en één keer met `ON_ERROR_STOP` zodat een fout de exitcode
rood maakt.

## Bestanden

| Bestand | Rol |
| ------- | --- |
| `00_supabase_stubs.sql` | stubt wat Supabase levert: het `auth`-schema, `auth.users`, `auth.uid()` en de rollen `anon`/`authenticated`/`service_role`. **Nooit** op Supabase draaien |
| `10_tests.sql` | 69 assertions: posten, idempotentie, validatie, deduplicatie, rate limits, kaartquery, bevestigen, flags, moderatie (incl. rolgrenzen), fotopijplijn, punten, retentie, IP-hashing en RLS (lezen én schrijven) |
| `20_perf.sql` | genereert 50 000 meldingen en meet de kaartquery met `EXPLAIN (ANALYZE)`. Draai dit na elke wijziging aan `reports` of `map_reports` |
| `30_cluster_cache.sql` | bewijst dat de opschaalstap (`db/scale/0100`) exact dezelfde aantallen geeft als de live query |
| `run_tests.sh` | volledige reeks; ook gebruikt door CI |

## Hoe `auth.uid()` in tests werkt

Supabase leest de gebruiker uit de JWT-claims. De stub leest dezelfde
GUC, dus je wisselt van gebruiker met:

```sql
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
```

Zo test `10_tests.sql` het gedrag van verschillende gebruikers, van een
moderator en van een niet-ingelogde bezoeker in één transactie.

## Valkuil: `now()` staat stil in een transactie

Alle tests lopen in één transactie, dus `now()` is voor elke rij hetzelfde
tijdstip. Een test die op leeftijd berust (retentie, cooldowns) moet de rij
**backdaten** in plaats van de termijn op nul te zetten — anders vergelijk je
`now() < now()` en lijkt de code stuk terwijl hij correct is.

## Tegen Supabase draaien

Op een echt project heb je de stubs niet nodig:

```bash
for f in db/migrations/*.sql; do
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
psql "$SUPABASE_DB_URL" -f db/seed/dev_seed.sql   # alleen dev/staging
```

(`supabase db push` werkt pas nadat je de migraties in het CLI-formaat hebt
gezet — zie de release-workflow of de QUICKSTART.)

`0005_storage.sql` doet lokaal niets (er is geen `storage`-schema) en maakt op
Supabase de twee buckets aan.
