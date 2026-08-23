# 13 — Implementatieplan

Zes sprints van elk ongeveer een week (voor één ontwikkelaar die er stevig aan
werkt). Elke sprint eindigt met iets dat op een toestel werkt — niet met een
laag die "later gebruikt zal worden".

## Sprint 1 — Fundament

- [ ] Monorepo opzetten (pnpm workspaces, `apps/mobile`, `packages/shared`)
- [ ] Supabase-projecten `dev` en `staging` aanmaken
- [ ] `db/migrations/*` toepassen met `supabase db push`
- [ ] `db/seed/dev_seed.sql` op dev laden
- [ ] CI-workflow aanzetten en groen krijgen (inclusief de DB-job)
- [ ] Expo-app die opstart en een MapLibre-kaart met de seed-meldingen toont

**Klaar wanneer:** je op je eigen telefoon, via Expo Go, de 200 seed-meldingen
op de kaart ziet clusteren.

Dit is bewust de eerste sprint: de kaart met echte data is het risicovolste
onderdeel van de UI, en je wil dat vroeg weten.

## Sprint 2 — Melden

- [ ] Anonieme auth bij de eerste start, sessie in secure store
- [ ] Meldflow: locatie (GPS + versleepbare pin) → drie typekeuzes → posten
- [ ] `create_report` aansluiten, met de volledige foutcodemapping
- [ ] Optimistische pin op de kaart
- [ ] `nearby_reports` vóór het posten → "bevestigen of toch melden"
- [ ] Detailscherm van een melding

**Klaar wanneer:** je buiten kan wandelen, drie meldingen kan maken, en ze op
een tweede toestel ziet verschijnen.

## Sprint 3 — Foto's en offline

- [ ] `upload-url` Edge Function
- [ ] Client: verkleinen naar 1600 px, JPEG q80 (EXIF verdwijnt)
- [ ] `scan-photo` Edge Function + storage-webhook (eerst met een mock die alles
      goedkeurt, daarna de echte vision-API)
- [ ] Offline outbox in SQLite, met backoff en zichtbare status
- [ ] Retry- en idempotentietests (scenario's 11–15 uit [10](10-rollout-en-testplan.md))

**Klaar wanneer:** vijf meldingen met foto in vliegtuigmodus, daarna netwerk
aan, geeft exact vijf meldingen met foto — niet vier, niet zes.

Sprint 3 is de zwaarste. De outbox en de fotopijplijn zijn waar de subtiele
bugs zitten; plan hier ruimte.

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
