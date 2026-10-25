# Edge Functions

Serverlogica die niet in de database kan (docs/02, docs/04). Deno + TypeScript;
deze map valt buiten de pnpm-workspace en buiten eslint/tsc — Deno heeft zijn
eigen toolchain.

| Functie | Doel |
| ------- | ---- |
| `upload-url` | Signed upload-URL voor `photo-inbox`, rate limit 30/uur/gebruiker |
| `scan-photo` | Storage-webhook: scant de foto, verplaatst hem naar `photo-public`, roept `complete_photo_scan()` |

## Deployen

```bash
supabase functions deploy upload-url
supabase functions deploy scan-photo --no-verify-jwt   # webhook, geen gebruikers-JWT
```

`scan-photo` verwacht deze secrets (`supabase secrets set`):

- `SCAN_PROVIDER` — `mock` (keurt alles goed; de standaard) of later een echte
  vision-API. De mock is bewust de eerste stap uit het implementatieplan: de
  hele pijplijn — webhook, verplaatsen, `complete_photo_scan`, quarantaine —
  werkt en is te testen vóór er een externe afhankelijkheid bij komt.
- `SCAN_WEBHOOK_SECRET` — gedeeld geheim; de storage-webhook stuurt het mee als
  `x-webhook-secret`-header, anders kan iedereen met de anon key scans forceren.

De webhook zelf maak je in het dashboard: Database → Webhooks, op
`INSERT` in `storage.objects`, filter op bucket `photo-inbox`, HTTP POST naar
`https://<project>.supabase.co/functions/v1/scan-photo` met de secret-header.

## Race met `create_report`

De client uploadt de foto **vóór** hij `create_report` aanroept, dus de webhook
kan vuren voordat de `report_photos`-rij bestaat. `scan-photo` probeert de rij
daarom tot een minuut lang opnieuw te vinden voor hij opgeeft; een foto zonder
rij (upload zonder melding) blijft ongescand in de inbox staan en wordt door
`purge_old_data` opgeruimd. Er is geen pad waarlangs zo'n foto publiek wordt
(ADR 0005: falen is restrictief).
