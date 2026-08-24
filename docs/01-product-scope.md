# 01 — Product & scope

## Probleem

Wie wandelt, ziet zwerfafval. Wie zwerfafval opruimt (gemeentedienst,
Mooimakers-vrijwilliger, buurtcomité, individuele afvalraper) weet niet waar het
ligt. Die twee groepen praten nu niet met elkaar: de wandelaar heeft geen
laagdrempelige manier om te melden, en de opruimer rijdt/wandelt op gevoel.

## Doelgroepen

| Rol | Wat ze doen in v1 | Drempel die we moeten wegnemen |
| --- | ----------------- | ------------------------------ |
| **Melder** (wandelaar, hondenuitlater, fietser) | Meldt afval in <15 seconden, zonder account | Registratie, formulieren, "gaat mijn naam hierop staan?" |
| **Opruimer** (vrijwilliger, afvalraper) | Bekijkt de kaart, gaat erop af | Moet zonder uitleg begrijpen wat een pin betekent |
| **Gemeente / afvalintercommunale** | Bekijkt de kaart, exporteert wat in hun gebied ligt | Mag geen extra tool zijn die ze moeten "beheren" |
| **Beheerder (jij)** | Modereert, houdt misbruik in de hand | Mag geen dagtaak worden |

## Scope v1 (eerste publieke roll-out)

**In scope**

1. Kaart met alle meldingen, anoniem, zonder inloggen te openen.
2. Melden: locatie (GPS of tik/versleep op de kaart) + type/grootte
   (papiertje / zak / afvalhoop) + optioneel één foto + optioneel notitie
   (max 280 tekens).
3. Melding bekijken: foto, type, wanneer gemeld, afstand tot mij.
4. Rapporteren van een melding (fout/ongepast/bestaat niet meer).
5. Offline melden: melding blijft in een wachtrij en gaat door zodra er netwerk is.
6. Nederlandse UI, met i18n-structuur zodat EN/FR later een vertaalbestand is.
7. Beheerdersconsole: quarantainewachtrij, melding verwijderen, gebruiker blokkeren.
8. Werkt als iOS-app, Android-app én mobiele web-app.

**Expliciet niet in scope voor v1** (zie [roadmap](11-roadmap-fase-2-3.md))

- Punten, sterren, badges, leaderboards.
- "Opgeruimd"-markering (**uitzondering**: het datamodel en de API zijn er wél
  al op voorzien, zodat fase 2 geen migratiepijn geeft).
- Voorgestelde routes.
- Andere meldingstypes dan afval (het `kind`-veld bestaat al, de UI toont enkel
  afval).
- Push-notificaties, chat, vriendenlijsten, koppeling met gemeentesystemen.
- Web-versie als volwaardige desktop-app (web is mobiel-eerst, voor testen en
  voor wie geen app wil installeren).

## Aannames

| # | Aanname | Impact als ze fout is |
| - | ------- | --------------------- |
| A1 | Pilootgebied is Vlaanderen/België; latere uitbreiding is een configuratieregel, geen herbouw | Service-area-tabel opent gewoon meer polygonen |
| A2 | Volume in jaar 1: 100–5.000 meldingen/maand, piek 50 gelijktijdige gebruikers | Bij 10× meer: activeer MVT-tiles ([06](06-kaart-en-performance.md)) |
| A3 | Melders willen géén account; opruimers willen dat later wél (voor punten) | Anonieme auth is upgradebaar naar een echt account ([ADR 0003](adr/0003-anonieme-identiteit.md)) |
| A4 | Eén foto per melding is genoeg | `report_photos` is al een 1-op-n tabel |
| A5 | Moderatie is haalbaar met één persoon in de piloot | Bij >20 quarantaines/dag: automatische fotoclassificatie verplicht maken |

## Kwaliteitseisen (niet-functioneel)

| Eigenschap | Doel v1 | Hoe gemeten |
| ---------- | ------- | ----------- |
| Tijd tot melding gepost | p95 < 15 s vanaf openen app | Client-event `report_submitted` |
| Kaart geladen | p95 < 1,5 s op 4G, mid-range Android | `map_first_paint` event |
| API-latency `map_reports` | p95 < 300 ms | Supabase logs / [SLO's](09-observability-en-slo.md) |
| Beschikbaarheid | 99,5 %/maand (≈3,6 u down) | Uptime-check elke minuut |
| Crash-vrije sessies | > 99,5 % | Sentry |
| Dataverlies bij offline melden | 0 — melding gaat door of geeft expliciete fout | Outbox-tests |
| Privacy | Geen publiek herleidbare melder; foto's gescand vóór publicatie | [07](07-privacy-security-moderatie.md) |

## Definitie van "klaar voor publieke roll-out"

Alle punten van de [go/no-go-checklist](10-rollout-en-testplan.md#gono-go) staan
op groen: device-matrix getest, privacyverklaring live, moderatiepad werkend,
rate limits actief, rollback-procedure één keer echt uitgevoerd.
