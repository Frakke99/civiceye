# ADR 0007 — Monorepo met pnpm workspaces

**Status:** aanvaard · **Datum:** 2026-08-23

## Context

Er zijn vier artefacten die bij elkaar horen: de mobiele app, de
beheerdersconsole, de Edge Functions en de databasemigraties. Ze delen types,
foutcodes en de puntenberekening.

## Beslissing

Eén repository, pnpm workspaces:

```
apps/mobile      Expo app (iOS, Android, web)
apps/admin       Next.js beheerdersconsole
packages/shared  types, foutcodes, points_for-spiegel
supabase/functions  Edge Functions (Deno)
db/             migraties, tests, seed, opschaalstappen
api/            openapi.yaml
docs/           architectuur
```

## Waarom één repo

- **Het API-contract kan niet uit elkaar lopen.** Een migratie die een RPC
  wijzigt, zit in dezelfde commit als de client die hem aanroept. Bij aparte
  repo's is een versiemismatch een kwestie van tijd.
- **Eén CI-run bewijst het geheel**: migraties + RLS-tests + typecheck van de
  client die diezelfde functies gebruikt.
- **`packages/shared` voorkomt duplicatie** van precies die dingen die stil uit
  elkaar groeien: foutcodes, enum-waarden, puntenwaarden.

## Gevolgen

- `db/migrations` is de bron; de release-workflow zet er tijdstempelkopieën
  van in `supabase/migrations` klaar, zodat de
  Supabase CLI werkt zonder de bestanden te dupliceren.
- Edge Functions zijn Deno en de apps zijn Node. Die twee runtimes leven naast
  elkaar met aparte configuratie; `packages/shared` blijft daarom bewust
  afhankelijkheidsvrije TypeScript, zodat beide hem kunnen importeren.
- CI moet slim genoeg zijn om alleen te draaien wat gewijzigd is (paden-filters
  in GitHub Actions), anders wordt elke commit een volledige build.

## Wanneer heroverwegen

Bij meerdere teams die op een verschillend tempo releasen. Bij één ontwikkelaar
is een monorepo puur winst.
