# Quickstart — hoe test je dit vandaag?

Eerst het eerlijke overzicht, want niet alles is nu al testbaar.

| Wat | Kan je nu? | Tijd | Hoe |
| --- | ---------- | ---- | --- |
| Backendlogica: melden, rate limits, moderatie, RLS | **ja**, volledig | 5 min | [laag 1](#laag-1--backend-lokaal-5-minuten) |
| Echte API vanaf je telefoon, met een kaartweergave | **ja** | ~30 min | [laag 2](#laag-2--echt-project--je-telefoon-30-minuten) |
| Melden met camera, GPS, offline, op iOS/Android | **nee, nog niet** | ~2 weken | [laag 3](#laag-3--de-echte-app-op-toestellen) |

De reden voor die laatste regel: deze repo bevat de architectuur en het volledige
backend — schema, API, beveiliging, tests — maar **nog geen appcode**. Er is dus
nog niets om op een toestel te installeren. Wat er wél is, kan je nu al draaien
en aanraken.

---

## Laag 1 — backend lokaal (5 minuten)

Bewijst dat het schema, de rate limits, de moderatie, de fotopijplijn en RLS
doen wat ze beloven: 48 assertions tegen een echte Postgres.

### Met Docker (aanbevolen — zelfde image als CI)

```bash
docker run --rm -d --name gc-db \
  -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgis/postgis:16-3.4

# even wachten tot hij klaar is
until docker exec gc-db pg_isready -q; do sleep 1; done

PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres ./db/test/run_tests.sh
```

### Of met een lokale Postgres

```bash
sudo apt-get install -y postgresql-16 postgresql-16-postgis-3   # Ubuntu/Debian
brew install postgresql@16 postgis                              # macOS
./db/test/run_tests.sh
```

Je verwacht `✓ alle migraties en tests geslaagd`, met daarvoor 48 regels `ok —`.
Zie je iets anders, dan is dat een echte fout en niet een omgevingsprobleem —
de tests hebben geen netwerk of Supabase-project nodig.

Verder nog interessant:

```bash
psql -d gc_test -f db/test/20_perf.sql       # 50k meldingen + EXPLAIN ANALYZE
psql -d gc_test -f db/seed/dev_seed.sql      # 212 meldingen om mee te spelen
```

---

## Laag 2 — echt project + je telefoon (30 minuten)

Hierna heb je een werkend backend in de cloud en zie je je eigen data op een
kaart, op elk toestel, zonder iets te installeren.

### 1. Supabase-project aanmaken

Maak een gratis project op supabase.com. Kies een **EU-regio** (`eu-central-1`
of `eu-west-1`) — dat maakt het privacyverhaal in
[docs/07](docs/07-privacy-security-moderatie.md) een stuk eenvoudiger.

### 2. Migraties toepassen

Neem de connection string uit *Project Settings → Database → Connection string
→ URI*, en pas de migraties in volgorde toe:

```bash
export DB_URL='postgresql://postgres.<ref>:<wachtwoord>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'

for f in db/migrations/*.sql; do
  echo "→ $(basename "$f")"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

> **Waarom psql en niet `supabase db push`?** De Supabase CLI verwacht de
> migraties in `supabase/migrations/` met een tijdstempel in de bestandsnaam
> (`20260824120000_init.sql`). Onze bestanden heten `0001_init.sql`, wat prima
> leest maar niet die conventie volgt. Wil je met de CLI werken, maak dan
> `supabase/migrations` als symlink naar `db/migrations` en hernoem de bestanden
> naar tijdstempels. Voor een eerste test is psql sneller en even correct.

Vergeet `db/migrations/0005_storage.sql` niet: die maakt de twee fotobuckets aan.
Op Supabase doet hij echt iets, lokaal wordt hij overgeslagen.

### 3. Anonieme aanmeldingen aanzetten

*Authentication → Sign In / Providers → Anonymous sign-ins* → aan.

Zonder dit kan niemand posten en krijg je overal `not_authenticated`. De hele
meldflow hangt hieraan ([ADR 0003](docs/adr/0003-anonieme-identiteit.md)).

### 4. Testdata laden

```bash
psql "$DB_URL" -f db/seed/dev_seed.sql
```

Je verwacht een tabel met ~212 meldingen, waarvan een deel opgeruimd en een deel
in quarantaine, zodat je alle vier de statussen ziet.

> Lukt dit niet omdat het `auth.users` niet mag aanraken, maak dan twee
> gebruikers via *Authentication → Users → Add user* en vervang de twee uuid's
> bovenaan `dev_seed.sql` door die van hen.

### 5. Backend controleren

```bash
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_ANON_KEY=<de anon/publishable key>

./scripts/smoke-api.sh
```

Dit script test in ~10 seconden de dingen die je écht wil weten:

- geeft `map_reports` losse meldingen als je inzoomt, en clusters als je uitzoomt?
- wordt een te groot kaartvenster geweigerd?
- **kan iemand met alleen de anon key posten?** (dat hoort te falen — die key zit
  in elke app-bundle en is publiek)
- **is de audittabel onleesbaar voor clients?**

Alle regels moeten `ok` zijn. Een `FOUT — LEK:`-regel betekent dat de grants of
RLS niet goed staan.

### 6. Op je telefoon bekijken

`tools/map-viewer.html` is een **diagnostische viewer**: één bestand, geen
build, geen installatie. Alleen lezen — geen melden, geen foto's, geen offline.

```bash
python3 -m http.server 8000
# op je telefoon, op hetzelfde wifi-netwerk:
# http://<ip-van-je-laptop>:8000/tools/map-viewer.html
```

Vul je Supabase-URL en anon key in. Een MapTiler-key (gratis op maptiler.com) is
**optioneel**: zonder key krijg je een lijstweergave van dezelfde data, mét key
een echte kaart met clusters die splitsen als je inzoomt. In beide gevallen zie
je onderaan hoe snel `map_reports` antwoordt — meet dat eens op 4G in plaats van
wifi.

Wil je het aan anderen doorsturen: zet dat ene bestand op Vercel, Netlify of
GitHub Pages en deel de link. Dan test je met vijf toestellen tegelijk zonder
dat iemand iets installeert.

De anon key hier invullen is veilig; die is publiek van ontwerp. Vul **nooit** de
`service_role`-key in — die staat naast de anon key in het dashboard en geeft
volledige toegang.

---

## Laag 3 — de echte app op toestellen

Dit vraagt appcode die er nog niet is. Volgens
[docs/13-implementatieplan.md](docs/13-implementatieplan.md) zijn dat sprint 1
en 2: kaart met echte data, dan de meldflow met GPS, camera en de offline
outbox. Daarna geeft EAS je een TestFlight- en een Play-build uit dezelfde
commit, plus een web-build als deelbare URL.

Wat nu al klaarligt en dus niet meer ontworpen hoeft te worden: het schema, alle
API-endpoints met hun foutcodes, het contract in `api/openapi.yaml`, de
beveiligingsregels mét tests, en het testplan met de device-matrix in
[docs/10](docs/10-rollout-en-testplan.md).

---

## Als iets niet lukt

| Symptoom | Oorzaak | Oplossing |
| -------- | ------- | --------- |
| `permission denied for function create_report` bij de smoketest | dat is **correct** — de anon key mag niet posten | niets; dit is de bedoeling |
| Overal `not_authenticated` | anonieme aanmeldingen staan uit | stap 3 hierboven |
| Kaart of lijst blijft leeg | geen data, of je kijkt buiten België | seed laden; het servicegebied is België ([0004](db/migrations/0004_seed_regions_and_jobs.sql)) |
| `outside_service_area` bij het posten | je coördinaten liggen buiten het pilootgebied | verwacht gedrag; voeg een rij toe aan `service_areas` voor een andere regio |
| Viewer toont `Failed to fetch` | verkeerde URL, of je opende het bestand via `file://` | serveer het via http (stap 6) |
| `extension "postgis" is not available` lokaal | PostGIS ontbreekt | de Docker-route in laag 1 |
| Tests falen op datums of retentie | `now()` staat stil binnen een transactie | zie de valkuil in [db/test/README.md](db/test/README.md) |
