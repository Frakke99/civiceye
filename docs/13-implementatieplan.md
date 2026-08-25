# 13 — Implementatieplan

Zes sprints van elk ongeveer een week (voor één ontwikkelaar die er stevig aan
werkt). Elke sprint eindigt met iets dat op een toestel werkt — niet met een
laag die "later gebruikt zal worden".

## Sprint 1 — Fundament ✅

- [x] Monorepo opzetten (pnpm workspaces, `apps/mobile`, `packages/shared`)
- [ ] Supabase-projecten `dev` en `staging` aanmaken *(jouw account — zie [QUICKSTART](../QUICKSTART.md))*
- [ ] `db/migrations/*` toepassen *(idem)*
- [ ] `db/seed/dev_seed.sql` op dev laden *(idem)*
- [x] CI-workflow aanzetten (DB-job, unittests, lint, types, browsertest)
- [x] Expo-app die opstart en een MapLibre-kaart met de meldingen toont

**Klaar wanneer:** je de kaart met meldingen ziet clusteren op je eigen toestel.

**Correctie op de oorspronkelijke planning:** hier stond "via Expo Go". Dat kan
niet: MapLibre is een native module en Expo Go bevat alleen de modules die Expo
zelf meelevert. Op een toestel heb je dus een **development build** nodig
(`npx expo run:android`, `npx expo run:ios` of
`eas build --profile development`). De app vangt dit netjes op: in Expo Go zie
je een uitleg plus dezelfde meldingen als lijst, geen wit scherm.

De web-versie werkt wél zonder enige installatie en gebruikt dezelfde
MapLibre-renderer — dat blijft de snelste weg om met meerdere toestellen te
testen.

Dit was bewust de eerste sprint: de kaart met echte data is het risicovolste
onderdeel van de UI, en je wil dat vroeg weten.

## Sprint 2 — Melden ✅

- [x] Anonieme auth bij de eerste start, sessie in secure store
- [x] Meldflow: locatie (GPS + versleepbare pin) → drie typekeuzes → posten
- [x] `create_report` aansluiten, met de volledige foutcodemapping
- [x] Optimistische pin op de kaart
- [x] `nearby_reports` vóór het posten → "bevestigen of toch melden"
- [x] Detailscherm van een melding

**Klaar wanneer:** je buiten kan wandelen, drie meldingen kan maken, en ze op
een tweede toestel ziet verschijnen.

**Hoe het gebouwd is:** de "versleepbare pin" is een vaste pin in het midden
van een kaartje dat je onder de pin door sleept — één aanrakingsmodel, werkt
identiek op web en native. GPS wordt pas gevraagd in de flow zelf, met de
uitleg uit `app.json` (expo-location); geweigerd betekent gewoon zelf slepen.
De duplicaatvraag verschijnt alleen bij hetzelfde type binnen 20 m, en
"bevestigen" gaat via `confirm_report`. Elke post krijgt bij de start van de
flow een `client_ref` (uuid v4), dus "opnieuw proberen" na een fout kan nooit
een dubbele melding worden. "Mijn meldingen" is meegenomen: eigen meldingen
via RLS, inclusief quarantaine. De offline outbox is bewust sprint 3 gebleven;
een netwerkfout toont nu een expliciete retry-knop.

## Sprint 3 — Foto's en offline ✅

- [x] `upload-url` Edge Function
- [x] Client: verkleinen naar 1600 px, JPEG q80 (EXIF verdwijnt)
- [x] `scan-photo` Edge Function + storage-webhook (eerst met een mock die alles
      goedkeurt, daarna de echte vision-API)
- [x] Offline outbox in SQLite, met backoff en zichtbare status
- [x] Retry- en idempotentietests (scenario's 11–15 uit [10](10-rollout-en-testplan.md))

**Klaar wanneer:** vijf meldingen met foto in vliegtuigmodus, daarna netwerk
aan, geeft exact vijf meldingen met foto — niet vier, niet zes.

Sprint 3 is de zwaarste. De outbox en de fotopijplijn zijn waar de subtiele
bugs zitten; plan hier ruimte.

**Hoe het gebouwd is:** de outbox heeft een pure kern (`src/outbox/core.ts`)
met injecteerbare opslag, API en klok — de scenario's 11–15 zijn daardoor
unittests in plaats van beloftes, inclusief "vijf offline meldingen worden er
exact vijf". Opslag is SQLite op native en localStorage op web; de drie
sync-triggers uit ADR 0006 (voorgrond, netwerk terug, timer) staan in de
root-layout aan. Een captive portal wordt gebroken door een harde timeout van
15 s die als netwerkfout parseert. De foto gaat vóór de melding; alleen een
netwerkfout houdt het hele item vast, elke andere uploadfout laat de melding
zonder foto doorgaan. De Edge Functions staan in `supabase/functions/` (met
deploy- en webhookinstructies in de README daar); de scanner is de mock die
alles goedkeurt (`SCAN_PROVIDER=mock`) — de echte vision-API is een bewuste
vervolgstap, want die vraagt een providerkeuze, een EU-regio en een plek in
het verwerkingsregister (ADR 0005). Het pad naar publicatie is verder
compleet: webhook → scan → verplaatsen naar `photo-public` →
`complete_photo_scan`, en een `flagged`-uitslag zet de melding in quarantaine.

## Sprint 4 — Moderatie en beheer

- [ ] `flag_report` in de app, met alle redenen
- [ ] Beheerdersconsole (Next.js): quarantainewachtrij, herstellen, verwijderen,
      gebruiker blokkeren
- [ ] Sentry in app en Edge Functions, met de log-hygiëneregels uit [09](09-observability-en-slo.md)
- [ ] Uptime-check en de vijf alerts
- [ ] `purge_old_data` schedulen via pg_cron

**Klaar wanneer:** je een eigen melding kan rapporteren, ze uit de app zien
verdwijnen, en ze in de console kan herstellen.

## Sprint 5 — Klaar voor testers

- [ ] i18n-structuur, alle teksten in `nl.json`
- [ ] Toegankelijkheid: contrast, raakvlakken, screenreaderlabels, 200 % tekst
- [ ] Web-build naar Vercel (de deelbare test-URL)
- [ ] EAS-buildprofielen; eerste TestFlight- en Play-internal-build
- [ ] Privacyverklaring en voorwaarden, in de app bereikbaar
- [ ] Store-listings, screenshots, privacylabels

**Klaar wanneer:** je één link kan sturen naar vijf mensen met verschillende
toestellen, en zij kunnen melden zonder jouw uitleg.

## Sprint 6 — Roll-outklaar

- [ ] Device-matrix aflopen, scenario's 1–30
- [ ] `prod`-project aanmaken, Pro-plan, backups + PITR
- [ ] Rollback één keer echt uitvoeren (EAS Update terugrollen)
- [ ] Backup één keer echt terugzetten
- [ ] Performance meten op productieachtige data (`db/test/20_perf.sql`)
- [ ] Go/no-go-checklist uit [10](10-rollout-en-testplan.md) aflopen
- [ ] Gefaseerde uitrol starten (Android 5 %)

**Klaar wanneer:** alle vinkjes op de go/no-go-lijst staan.

## Wat je in deze volgorde níet doet

Punten, routes en extra meldingstypes. Ze staan al in het schema, dus ze kosten
je nu niets, en ze zouden de eerste roll-out weken vertragen. Bouw ze pas als
fase 1 aantoont dat mensen effectief melden — dat is de enige aanname die het
hele product draagt, en de enige die je niet met een architectuur kan oplossen.

## Grootste risico's

| Risico | Kans | Beperking |
| ------ | ---- | --------- |
| Niemand meldt | hoog | fase 1 klein en meetbaar houden; één gemeente, echte wandelaars, snel feedback |
| GPS-nauwkeurigheid tussen bomen is slecht | hoog | pin altijd versleepbaar, `accuracy_m` tonen, nooit blind op GPS vertrouwen |
| Ongepaste foto in de publieke kaart | midden | scan vóór publicatie, `private_person`-fastpath, takedown binnen 24 u |
| Store-afwijzing (locatie/camera-rechtvaardiging) | midden | permissies pas vragen bij gebruik, met uitleg; geen achtergrondlocatie |
| Outbox-bugs die meldingen verliezen | midden | `client_ref`-idempotentie, expliciete tests, zichtbare wachtrij in de UI |
| Moderatie loopt vol | laag in fase 1 | drempels in `app_config`, ADR 0008-fase 2 achter de hand |
