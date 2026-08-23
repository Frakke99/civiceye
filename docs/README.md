# Documentatie-index

Architectuur voor **Global Cleanup** — een anonieme meldkaart voor zwerfafval.
Doel van dit ontwerp: **matuur genoeg voor een eerste publieke roll-out**, niet
matuur genoeg voor 10 miljoen gebruikers. Waar we bewust een eenvoudigere
oplossing kiezen, staat de opschaaltrigger erbij ("wanneer wordt dit een
probleem, en wat doen we dan").

## Kerndocumenten

| # | Document | Waarover |
| - | -------- | -------- |
| 01 | [Product & scope](01-product-scope.md) | Wat zit in v1, wat niet, wie zijn de gebruikers, welke aannames |
| 02 | [Architectuuroverzicht](02-architectuur-overzicht.md) | Componenten, dataflows, diagrammen |
| 03 | [Datamodel](03-datamodel.md) | Tabellen, enums, indexen, RLS, retentie |
| 04 | [API-contract](04-api-contract.md) | Alle endpoints, foutcodes, idempotentie |
| 05 | [Mobiele client](05-mobile-client.md) | App-structuur, state, offline outbox, permissies |
| 06 | [Kaart & performance](06-kaart-en-performance.md) | Tiles, clustering, querybudget, opschaalpad |
| 07 | [Privacy, security & moderatie](07-privacy-security-moderatie.md) | GDPR, foto's, anonimiteit, misbruik, moderatie |
| 08 | [Infrastructuur, omgevingen & CI/CD](08-infra-omgevingen-cicd.md) | dev/staging/prod, migraties, releases |
| 09 | [Observability & SLO's](09-observability-en-slo.md) | Logs, metrics, alerts, foutbudget |
| 10 | [Roll-out & testplan](10-rollout-en-testplan.md) | Device-matrix, beta-kanalen, go/no-go |
| 11 | [Roadmap fase 2 & 3](11-roadmap-fase-2-3.md) | Punten, routes, extra meldingstypes, gemeenteportaal |
| 12 | [Kosten](12-kosten.md) | Wat kost dit per maand, per fase |
| 13 | [Implementatieplan](13-implementatieplan.md) | Concrete bouwvolgorde in 6 sprints |

## Beslissingen (ADR's)

| ADR | Beslissing |
| --- | ---------- |
| [0001](adr/0001-client-platform-expo.md) | Expo/React Native voor iOS + Android + web |
| [0002](adr/0002-backend-supabase.md) | Supabase (Postgres/PostGIS) i.p.v. eigen backend |
| [0003](adr/0003-anonieme-identiteit.md) | Anonieme auth met device-gebonden account |
| [0004](adr/0004-kaart-en-clustering.md) | MapLibre + bbox-RPC, MVT-tiles als opschaalstap |
| [0005](adr/0005-foto-pipeline.md) | Twee-bucket foto-pipeline met scan vóór publicatie |
| [0006](adr/0006-offline-outbox.md) | Offline-first outbox met idempotente writes |
| [0007](adr/0007-repo-structuur.md) | Monorepo met pnpm workspaces |
| [0008](adr/0008-moderatie-model.md) | Publiceren-dan-modereren met automatische quarantaine |

## Uitvoerbare artefacten

- `db/migrations/` — SQL-migraties (schema, functies, RLS, seed-regio's)
- `db/seed/dev_seed.sql` — testdata: ~200 meldingen rond Antwerpen/Kempen
- `api/openapi.yaml` — machineleesbaar API-contract
- `.github/workflows/` — CI (lint/test/migratie-check) en release-pijplijn
