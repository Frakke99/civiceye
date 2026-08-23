# ADR 0001 — Expo/React Native voor iOS, Android en web

**Status:** aanvaard · **Datum:** 2026-08-23

## Context

Er moet één app komen die op iPhone, Android én in de browser werkt. Belangrijke
randvoorwaarde uit de opdracht: het moet **testbaar zijn op verschillende
toestellen**, zonder dat elke test een dag opzetwerk kost. Verder: camera, GPS,
kaartweergave en offline werken — allemaal zaken die dicht bij het toestel zitten.

## Opties

| Optie | Voordeel | Nadeel |
| ----- | -------- | ------ |
| **Expo (React Native)** | één codebase voor iOS/Android/web; EAS Build + TestFlight/Play zonder eigen buildinfrastructuur; EAS Update voor OTA-fixes; camera/GPS/SQLite zijn kant-en-klare modules | JS-brug kan zwaar zijn bij zeer complexe kaartinteractie; native modules vereisen een nieuwe build |
| Flutter | uitstekende performance, mooie kaartweergave | tweede taal (Dart); web-build is zwaar; minder vlot voor snelle OTA-fixes |
| Native iOS + Android | beste performance en platformgevoel | twee codebases, twee keer het werk; geen web |
| PWA alleen | geen store, direct testbaar | camera/GPS-toegang beperkter, geen betrouwbare offline outbox op iOS, geen store-vindbaarheid |

## Beslissing

**Expo (React Native) met expo-router en TypeScript.**

Doorslaggevend zijn twee dingen:

1. **Testen op toestellen.** EAS Build levert een TestFlight- en een
   Play-internal-build uit dezelfde commit, en de web-build geeft een deelbare
   URL. Je kan dus binnen een uur op vijf verschillende toestellen zitten,
   zonder Xcode of Android Studio op je machine.
2. **EAS Update.** Bij een eerste publieke roll-out is een JS-fix binnen tien
   minuten uitrollen — zonder store-review — het verschil tussen een slechte dag
   en een slechte week.

De PWA-optie schrapt niet af, maar bestaat er náást: hij is de snelste testweg
en de manier waarop iemand zonder installatie kan meekijken.

## Gevolgen

- Kaart via een adapter (`src/map/`): `@maplibre/maplibre-react-native` op
  native, `maplibre-gl` op web. Één interface, twee implementaties.
- Expo SDK-upgrades zijn periodiek onderhoud (2–3× per jaar), niet vermijdbaar.
- Native modules toevoegen vereist een nieuwe store-build — daarom kiezen we het
  native oppervlak vroeg en houden het klein: camera, locatie, SQLite,
  secure-store, kaart.
- De web-variant heeft aanvaarde beperkingen: geen achtergrondsync van de
  outbox, minder nauwkeurige GPS. Dat staat in de UI.

## Wanneer heroverwegen

Als kaartinteractie op low-end Android merkbaar hapert ondanks server-side
clustering, of als het native oppervlak zo groeit dat OTA-updates weinig meer
opleveren.
