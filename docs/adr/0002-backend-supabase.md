# ADR 0002 — Supabase in plaats van een eigen backend

**Status:** aanvaard · **Datum:** 2026-08-23

## Context

We hebben nodig: geodata met ruimtelijke query's, foto-opslag met CDN,
authenticatie (ook anoniem), een plek voor wat serverlogica, en dat alles met
zo weinig beheer als mogelijk. Er is één ontwikkelaar en er moet een publieke
roll-out van komen.

## Opties

| Optie | Voordeel | Nadeel |
| ----- | -------- | ------ |
| **Supabase** | Postgres **met PostGIS**; auth inclusief anonieme sessies; Storage + CDN; Edge Functions; RLS als beveiligingslaag in de databank; alles blijft gewone Postgres | vendor-afhankelijkheid voor auth/storage; Edge Functions zijn Deno |
| Firebase | zeer volwassen, uitstekende SDK's | Firestore heeft **geen** echte geo-query's (geohash-workarounds); relationele rapportage is lastig |
| Eigen backend (Node/Postgres op Fly.io of Hetzner) | volledige controle | jij patcht, monitort en back-upt alles; weken extra werk vóór de eerste roll-out |
| AWS (Amplify/AppSync) | schaalt eindeloos | complexiteit en kosten die niet passen bij deze fase |

## Beslissing

**Supabase**, met de databank als beveiligingsgrens.

PostGIS is hier het beslissende argument. Het hele product is één ruimtelijke
vraag ("welke meldingen liggen in dit venster?"), en Postgres+PostGIS antwoordt
daarop in milliseconden met een index die er standaard is. Firebase zou dat met
geohash-trucs moeten benaderen.

Tweede argument: **RLS + security-definer-functies** geven een beveiligingsmodel
dat niet omzeild kan worden door een aangepaste client. Bij een eigen backend
zou dezelfde garantie een aparte, zelfgeschreven en zelf te testen laag zijn.

## Gevolgen

- Alle schrijfacties lopen via Postgres-functies. Dat is geen omweg maar het
  ontwerp: de regels staan waar de data staat, en `db/test/10_tests.sql` test ze.
- Geen eigen API-laag in v1. Minder deploys, minder faalpunten.
- Edge Functions (Deno) enkel voor wat de databank niet kan: extern netwerk,
  storage-orchestratie, bestandsgeneratie.
- Vendor-lock is beperkt tot auth en storage. De data zit in gewone Postgres met
  gewone SQL-migraties; `pg_dump` werkt. Foto's zijn objecten achter
  `bucket` + `path`, dus verhuizen naar R2 raakt één laag.
- Het Pro-plan (€ 25/maand) is verplicht voor productie: zonder PITR is een
  slechte migratie onherstelbaar.

## Wanneer heroverwegen

Als we logica nodig hebben die niet in SQL of Deno past (zware
routeberekeningen, beeldverwerking), of als het leesverkeer de databank belast
ondanks caching. Dan komt er een aparte service **naast** dezelfde Postgres —
niet in plaats van.
