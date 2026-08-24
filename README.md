# Global Cleanup

Wandelaars melden zwerfafval (en andere problemen) op de kaart, zodat gemeenten,
afvalrapers en vrijwilligers snel zien waar er werk ligt.

- **Melden**: locatie kiezen (GPS of tik op de kaart) → afvaltype/-grootte kiezen
  (papiertje / zak / afvalhoop) → optioneel foto → posten.
- **Bekijken**: alle meldingen van iedereen, anoniem, op één kaart.
- **Later**: opgeruimd markeren + punten, voorgestelde opruimroutes, andere
  meldingstypes (gevaarlijk terrein, dood dier, omgevallen boom, kapot bankje).

## Status

Dit is de **architectuurfase**. Deze repo bevat (nog) geen applicatiecode: hij
bevat het ontwerp dat matuur genoeg is voor een eerste publieke roll-out, plus
de concrete artefacten die je meteen kan uitvoeren (databaseschema, API-contract,
CI-workflows, testplan).

## Waar begin je?

| Ik wil…                                    | Lees dit                                              |
| ------------------------------------------ | ----------------------------------------------------- |
| Snappen wat we bouwen en wat níet          | [docs/01-product-scope.md](docs/01-product-scope.md)  |
| De architectuur in één beeld               | [docs/02-architectuur-overzicht.md](docs/02-architectuur-overzicht.md) |
| **Dit nu zelf uitproberen**                | **[QUICKSTART.md](QUICKSTART.md)**                    |
| Beginnen met bouwen                        | [docs/13-implementatieplan.md](docs/13-implementatieplan.md) |
| Testen op verschillende toestellen         | [docs/10-rollout-en-testplan.md](docs/10-rollout-en-testplan.md) |
| Weten waarom een keuze zo gemaakt is       | [docs/adr/](docs/adr/)                                |

Volledige index: **[docs/README.md](docs/README.md)**

## Technologie in één alinea

Eén Expo/React Native-codebase levert iOS, Android én een mobiele web-app
(PWA), zodat je met één build op alle toestellen kan testen. De backend is
Supabase: Postgres met PostGIS voor de geodata, anonieme auth voor
identiteitsloos melden mét misbruikbescherming, Storage + CDN voor foto's, en
Edge Functions voor de paar dingen die serverlogica nodig hebben. De kaart
draait op MapLibre met vector tiles.

Zie [ADR 0001](docs/adr/0001-client-platform-expo.md) en
[ADR 0002](docs/adr/0002-backend-supabase.md) voor de afwegingen.
