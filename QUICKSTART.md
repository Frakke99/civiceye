# Quickstart — hoe test je dit vandaag?

Eerst het eerlijke overzicht, want niet alles is nu al testbaar.

| Wat | Kan je nu? | Tijd | Hoe |
| --- | ---------- | ---- | --- |
| Backendlogica: melden, rate limits, moderatie, RLS | **ja**, volledig | 5 min | [laag 1](#laag-1--backend-lokaal-5-minuten) |
| Echte API vanaf je telefoon, met een kaartweergave | **ja** | ~30 min | [laag 2](#laag-2--echt-project--je-telefoon-30-minuten) |
| De app zelf draaien (kaart met meldingen) | **ja** | ~10 min | [laag 3](#laag-3--de-app-draaien) |
| Melden met camera, GPS, offline | **nee, nog niet** | sprint 2-3 | [laag 4](#laag-4--wat-er-nog-niet-is) |

Sprint 1 is gebouwd: er is een echte Expo-app met een MapLibre-kaart die de
meldingen uit je databank clustert. Melden zelf (locatie, type, foto, offline
wachtrij) is sprint 2.

**Nog nooit een terminal gebruikt voor dit project?** Begin bij
[Voor je begint](#voor-je-begint--de-code-op-je-eigen-machine): daar staat hoe
je Node, pnpm en de code op je machine krijgt, en welk programma je opent.

---

## Voor je begint — de code op je eigen machine

Alle commando's in dit document draai je in een **terminal op je eigen
computer**, in de map van dit project. Niet in een browser, en niet in een
chatvenster.

| Besturingssysteem | Welk programma |
| ----------------- | -------------- |
| Windows | **Windows Terminal** of **PowerShell** (Start → "terminal") |
| macOS | **Terminal** (Cmd+Space → "terminal") |
| Linux | je gewone terminal — Node 22, git en pnpm via je packagemanager |

### Eenmalig: Node, pnpm en git installeren

Je hebt **Node.js 22 of hoger** nodig, plus **pnpm** en **git**.

Windows (PowerShell):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git

# PowerShell blokkeert standaard alle scripts, en npm/pnpm zíjn scripts.
# Dit versoepelt dat alleen voor jouw account (geen admin nodig):
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

npm install -g pnpm@10
```

Krijg je toch "running scripts is disabled on this system", dan is die
`Set-ExecutionPolicy`-regel nog niet gedraaid — draai hem en probeer opnieuw.

macOS (met Homebrew):

```bash
brew install node git
npm install -g pnpm@10
```

Sluit daarna je terminal en open een nieuwe, anders kent hij de nieuwe
commando's nog niet. Controleren:

```bash
node --version    # moet v22 of hoger zijn
pnpm --version    # moet 10.x zijn
git --version
```

### De code binnenhalen

```bash
git clone https://github.com/Frakke99/civiceye.git
cd civiceye
git checkout claude/afval-meldingsapp-architecture-zuaypg
```

De laatste regel is belangrijk: het werk staat op die branch, niet op `main`.

Vanaf nu geldt: **je staat in de map `civiceye`** wanneer je een commando
uit dit document uitvoert. Controleer dat met `pwd` (macOS/Linux) of `cd`
(Windows) — er moet `civiceye` in staan.

### De snelste test: de app aanklikken

```bash
pnpm install     # eenmalig, haalt de afhankelijkheden op (~2 min)
pnpm e2e:build   # bouwt de web-app (~1 min)
pnpm demo        # start de app met verzonnen meldingen
```

Het laatste commando print twee adressen: één voor deze computer en één voor je
telefoon op hetzelfde wifi-netwerk. Open dat adres in je browser. Stoppen doe je
met Ctrl-C.

Je hebt hier **geen Supabase-project voor nodig** — de demo praat met een
nagemaakt backend. Wil je je eigen data zien, ga dan naar laag 2 en 3.

> **Telefoon krijgt "site niet bereikbaar"?** Dan blokkeert de Windows
> Firewall inkomende verbindingen naar Node. Twee dingen controleren:
>
> 1. Bij de eerste start toont Windows een venster "Windows Defender Firewall
>    heeft enkele functies van Node.js geblokkeerd" — vink daar
>    **Privénetwerken** aan en klik *Toegang toestaan*. Weggeklikt? Herstel het
>    met één regel in een **PowerShell als administrator**:
>
>    ```powershell
>    New-NetFirewallRule -DisplayName "CivicEye demo" -Direction Inbound -Protocol TCP -LocalPort 8810,8811 -Action Allow
>    ```
>
> 2. Je wifi moet op je pc als **Privénetwerk** staan: Instellingen → Netwerk
>    en internet → Wi-Fi → jouw netwerk → Netwerkprofieltype → Privé. Op
>    "Openbaar" blokkeert Windows dit soort verkeer sowieso.
>
> Helpt dat niet: zet een eventuele VPN op je telefoon uit, en weet dat
> gasten-wifi vaak "isolatie" heeft waardoor toestellen elkaar nooit zien.

---

## Laag 1 — backend lokaal (5 minuten)

Bewijst dat het schema, de rate limits, de moderatie, de fotopijplijn en RLS
doen wat ze beloven: 69 assertions tegen een echte Postgres, plus een
pariteitstest van de opschaalstap.

### Met Docker (aanbevolen — zelfde image als CI)

macOS/Linux:

```bash
docker run --rm -d --name civiceye-db \
  -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgis/postgis:16-3.4

# even wachten tot hij klaar is
until docker exec civiceye-db pg_isready -q; do sleep 1; done

PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres ./db/test/run_tests.sh
```

Windows (PowerShell — vereist Docker Desktop): het testscript is bash, dus we
draaien alles ín de container; daar zitten bash en de Postgres-tools al in.

```powershell
docker run --rm -d --name civiceye-db -e POSTGRES_PASSWORD=postgres `
  -v "${PWD}:/repo" -w /repo postgis/postgis:16-3.4

docker exec civiceye-db pg_isready   # herhaal tot "accepting connections"

docker exec -e PGUSER=postgres civiceye-db bash db/test/run_tests.sh
docker stop civiceye-db
```

### Of met een lokale Postgres

```bash
sudo apt-get install -y postgresql-16 postgresql-16-postgis-3   # Ubuntu/Debian
brew install postgresql@16 postgis                              # macOS
./db/test/run_tests.sh
```

Je verwacht `✓ alle migraties en tests geslaagd`, met daarvoor 78 regels `ok —`.
Zie je iets anders, dan is dat een echte fout en niet een omgevingsprobleem —
de tests hebben geen netwerk of Supabase-project nodig.

Verder nog interessant:

```bash
psql -d civiceye_test -f db/test/20_perf.sql       # 50k meldingen + EXPLAIN ANALYZE
psql -d civiceye_test -f db/seed/dev_seed.sql      # 212 meldingen om mee te spelen
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
in quarantaine — de statussen die je op de kaart kan tegenkomen.

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

Wil je ook het schrijfpad testen (`create_report`), geef dan een echt
gebruikers-JWT mee. Dat haal je op met de anonieme aanmelding:

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])'

CIVICEYE_JWT=<dat token> ./scripts/smoke-api.sh
```

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

## Laag 3 — de app draaien

### Eenmalig instellen

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
# vul EXPO_PUBLIC_SUPABASE_URL en EXPO_PUBLIC_SUPABASE_ANON_KEY in
```

De MapTiler-key is optioneel: zonder key krijg je je meldingen op een effen
ondergrond in plaats van op een kaart. Alles werkt, je ziet alleen geen straten.

### In de browser (snelste weg, werkt op elk toestel)

```bash
pnpm web
```

Dat start Expo met de web-versie. Open de URL op je telefoon (zelfde
wifi-netwerk) en je hebt de echte app — dezelfde MapLibre-renderer als op
native. Om te delen met testers:

```bash
pnpm web:build            # bouwt apps/mobile/dist
```

Zet die map op Vercel, Netlify of GitHub Pages. **Belangrijk:** de build is een
SPA, dus de host moet onbekende paden naar `index.html` laten wijzen. Zonder die
rewrite werkt een directe link naar `/report/<id>` niet.

### Op iOS en Android

```bash
npx expo run:android      # of: npx expo run:ios
```

Dit maakt een **development build**. Dat is nodig omdat de kaart MapLibre
gebruikt, een native module die niet in Expo Go zit. Zonder eigen Mac/Android
Studio kan je hetzelfde via EAS:

```bash
npx eas build --profile development --platform android
```

Draai je toch in Expo Go, dan crasht de app niet: je krijgt uitleg en dezelfde
meldingen als lijst. De overige schermen werken er normaal.

### Controleren of het werkt

```bash
pnpm test                 # 57 unittests op de pure logica
pnpm e2e:build            # bouwt de app voor de browsertest
pnpm test:e2e             # draait de app in Chromium tegen een nagemaakt backend
```

De e2e-test bewijst dat de kaart rendert, dat de kaartquery een geldige bbox
verstuurt, dat clusters correct opgeteld worden en dat een onbestaande melding
een Nederlandse fout geeft in plaats van een crash.

## Laag 4 — wat er nog niet is

| Onderdeel | Sprint |
| --------- | ------ |
| Melden: locatie, type, foto, posten | 2 |
| Offline outbox | 3 |
| Rapporteren en de beheerdersconsole | 4 |
| Meertaligheid, store-builds, privacyteksten | 5 |
| Device-matrix en go/no-go | 6 |

Zie [docs/13-implementatieplan.md](docs/13-implementatieplan.md).

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
| App toont "Kaart niet beschikbaar" op een toestel | je draait in Expo Go | maak een development build (`npx expo run:android`) |
| Directe link naar `/report/<id>` geeft 404 op je host | SPA-rewrite ontbreekt | alle paden naar `index.html` laten wijzen |
| `Ontbrekende configuratie: EXPO_PUBLIC_SUPABASE_URL` | geen `.env` in `apps/mobile` | `cp apps/mobile/.env.example apps/mobile/.env` en invullen |
| Kaart blijft grijs, markers wel zichtbaar | geen MapTiler-key | verwacht gedrag; vul `EXPO_PUBLIC_MAPTILER_KEY` in |
| Kaart is leeg terwijl de balk "N meldingen" toont | de maplibre-worker ontbreekt in de build | `pnpm prepare:web` en opnieuw bouwen; gebruik `pnpm web:build` in plaats van `expo export` |
| Clusters tonen geen getal | zonder MapTiler-key is er geen font | verwacht gedrag; bollen verschillen wel in grootte |
