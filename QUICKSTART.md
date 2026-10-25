# Quickstart — hoe test je dit vandaag?

Eerst het eerlijke overzicht, want niet alles is nu al testbaar.

| Wat | Kan je nu? | Tijd | Hoe |
| --- | ---------- | ---- | --- |
| Backendlogica: melden, rate limits, moderatie, RLS | **ja**, volledig | 5 min | [laag 1](#laag-1--backend-lokaal-5-minuten) |
| Echte API vanaf je telefoon, met een kaartweergave | **ja** | ~30 min | [laag 2](#laag-2--echt-project--je-telefoon-30-minuten) |
| De app zelf draaien (kaart met meldingen) | **ja** | ~10 min | [laag 3](#laag-3--de-app-draaien) |
| Melden met GPS, foto en offline wachtrij | **ja** | zit in de app | sprint 2 + 3 zijn gebouwd |
| Eén deelbare demo-URL voor al je testers | **ja** | ~15 min na laag 2 | [de deelbare demo-URL](#de-deelbare-demo-url-github-pages) |
| Rapporteren, beheerdersconsole | nee | sprint 4 | [laag 4](#laag-4--wat-er-nog-niet-is) |

Sprint 1 tot en met 3 zijn gebouwd: een Expo-app met een MapLibre-kaart die de
meldingen clustert, een volledige meldflow (GPS + versleepbare pin, drie
groottes, duplicaatvraag), foto's die verkleind en zonder EXIF vertrekken, en
een offline outbox die meldingen vasthoudt tot er weer netwerk is.

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
| Linux | je gewone terminal |

### Eenmalig: Node, pnpm en git installeren

Je hebt **Node.js 22 of hoger** nodig, plus **pnpm** en **git**.

Windows (PowerShell):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
npm install -g pnpm@10
```

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
git clone https://github.com/Frakke99/global-cleanup.git civiceye
cd civiceye
git checkout claude/bouw-sprint-2-ppkjav
```

Twee dingen om te weten bij deze drie regels:

- De **repository** op GitHub heet nog `global-cleanup`. Het project heet
  CivicEye, maar de naam van een GitHub-repo verander je in de
  instellingen van die repo; dat is een aparte handeling. Door achter de
  clone-URL `civiceye` te zetten, komt de code toch in een map met de
  juiste naam. Hernoem je de repo later, dan blijft deze URL werken:
  GitHub stuurt oude adressen door.
- De laatste regel is belangrijk zolang [PR #2](https://github.com/Frakke99/civiceye/pull/2)
  (sprint 2 + 3) nog niet gemerged is: het recentste werk staat op die branch.
  Na de merge volstaat `main` en mag je die regel weglaten.

Vanaf nu geldt: **je staat in de map `civiceye`** wanneer je een commando
uit dit document uitvoert. Controleer dat met `pwd` (macOS/Linux) of `cd`
(Windows) — er moet `civiceye` in staan.

### De snelste test: de app aanklikken

```bash
pnpm install     # eenmalig, haalt de afhankelijkheden op (~2 min)
pnpm e2e:build   # bouwt de web-app (~1 min)
pnpm demo        # start de app met verzonnen meldingen
```

Het laatste commando print het adres voor deze computer. Open het in je
browser: kaart, meldflow, offline wachtrij — alles werkt tegen een nagemaakt
backend. Stoppen doe je met Ctrl-C.

**Ook op je telefoon meekijken (zelfde wifi)?** Gebruik dan:

```bash
pnpm demo:lan    # bouwt met het wifi-adres van deze machine én start de demo
```

De gewone build bakt `127.0.0.1` in als API-adres, en dat is op je telefoon de
telefoon zelf — vandaar de aparte variant. Wat je op het ene toestel meldt,
verschijnt op het andere na een kaartbeweging. Nog twee beperkingen van deze
weg: GPS werkt op een telefoon alleen via https (dus hier niet — de pin
verslepen werkt wél), en de verzonnen data verdwijnt zodra je de demo stopt.

Je hebt hier **geen Supabase-project voor nodig**. Voor een echte demo met
blijvende data en een deelbare link: laag 2 en daarna
[de deelbare demo-URL](#de-deelbare-demo-url-github-pages).

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
pnpm test                 # 85 unittests op de pure logica
pnpm e2e:build            # bouwt de app voor de browsertest
pnpm test:e2e             # draait de app in Chromium tegen een nagemaakt backend
```

De e2e-test bewijst dat de kaart rendert, doorloopt de volledige meldflow
(GPS, duplicaatvraag, de exacte post-payload) en doet een offline→online-
rondgang: offline melden, de zichtbare wachtrij, en de melding die alsnog
doorgaat zodra het netwerk terug is.

---

## De deelbare demo-URL (GitHub Pages)

Dit is de weg naar "één link sturen en iedereen test mee, op eender welk
toestel": de web-app op GitHub Pages, tegen je echte Supabase-project. Https,
dus GPS werkt ook op telefoons. Voorwaarde: laag 2 is gedaan (project,
migraties, anonieme aanmeldingen, seed).

Eenmalig, in de GitHub-repo (~5 minuten):

1. **Settings → Pages → Source** op **GitHub Actions** zetten.
2. **Settings → Secrets and variables → Actions → tab Variables** — drie
   repository variables aanmaken:

   | Naam | Waarde |
   | ---- | ------ |
   | `EXPO_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | de anon/publishable key |
   | `EXPO_PUBLIC_MAPTILER_KEY` | optioneel — gratis key van maptiler.com |

   Variables en geen Secrets: deze waarden zitten sowieso in de publieke
   app-bundle. De `service_role`-key hoort hier dus **nooit** bij.
3. **Actions → "Web-demo naar GitHub Pages" → Run workflow.** Kies de branch
   met het recentste werk (of `main` na de merge van PR #2). Daarna deployt
   elke push naar `main` automatisch opnieuw.

De app staat dan op `https://<owner>.github.io/<repo>/` — dat is de link die
je deelt. De MapTiler-key is voor een demo sterk aan te raden: mét key zien
testers straten en pleinen, zonder key een effen ondergrond.

Foto's meesturen werkt pas wanneer ook de twee Edge Functions gedeployed zijn
(zie [supabase/functions/README.md](supabase/functions/README.md)); zonder die
functies gaat een melding gewoon zonder foto door — de rest van de demo merkt
er niets van.

## Laag 4 — wat er nog niet is

| Onderdeel | Sprint |
| --------- | ------ |
| Sentry en uptime-alerts (vraagt accounts) | 4 |
| Echte vision-API in de fotoscan (nu: mock keurt alles goed) | 4–5 |
| Meertaligheid, store-builds, privacyteksten | 5 |
| Device-matrix en go/no-go | 6 |

Rapporteren zit sinds sprint 4 in de app, en de beheerdersconsole staat in
`apps/admin` (`pnpm --filter @civiceye/admin dev`, zie de `.env.example` daar).
Een moderator is een gewone Supabase-gebruiker (Authentication → Users) die je
promoveert met `update public.profiles set trust_level = 3 where id = '<uuid>'`.

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
