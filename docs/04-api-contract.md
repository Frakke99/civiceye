# 04 — API-contract

Basis-URL per omgeving: `https://<project-ref>.supabase.co`
Machineleesbaar: [`api/openapi.yaml`](../api/openapi.yaml)

Elke aanroep stuurt:

```
apikey: <anon key>
Authorization: Bearer <JWT van de gebruiker>
Content-Type: application/json
```

De anon key is publiek (hij zit in de app) en geeft op zichzelf geen toegang:
autorisatie komt van RLS en van de functie-grants.

## Endpoints

### `POST /rest/v1/rpc/map_reports` — kaartdata

```json
{ "min_lng": 4.39, "min_lat": 51.21, "max_lng": 4.43, "max_lat": 51.24,
  "zoom": 15, "kinds": ["litter"], "include_cleaned": false }
```

```json
[ { "is_cluster": false, "lng": 4.4025, "lat": 51.2194, "point_count": 1,
    "report_id": "…", "kind": "litter", "size": "bag",
    "has_photo": true, "created_at": "2026-08-20T14:12:00Z" },
  { "is_cluster": true, "lng": 4.4108, "lat": 51.2231, "point_count": 23,
    "report_id": null, "kind": "litter", "size": "piece",
    "has_photo": true, "created_at": "2026-08-22T09:03:00Z" } ]
```

- `zoom >= 14` → losse meldingen (max 600, nieuwste eerst).
- `zoom < 14` → clusters; `point_count` is het aantal meldingen in de cel,
  `kind`/`size` het dominante type, `created_at` de nieuwste melding.
- Openbaar: werkt met een anonieme sessie én zonder ingelogde gebruiker.

### `POST /rest/v1/rpc/report_details` — één melding

`{ "p_report_id": "uuid" }` → melding met `photos[]` (`bucket` + `path`, te
combineren tot een CDN-URL), `is_mine`, `confirm_count`.
Gequarantineerde meldingen zijn enkel voor de eigen melder zichtbaar.

### `POST /rest/v1/rpc/nearby_reports` — "ligt hier al iets?"

`{ "p_lat": 51.2194, "p_lng": 4.4025, "p_radius_m": 50 }` → tot 20 meldingen met
`distance_m`, gesorteerd op afstand. De app roept dit aan vóór het posten, en
biedt "bevestigen" aan in plaats van een duplicaat.

### `POST /rest/v1/rpc/create_report` — melden *(auth vereist)*

```json
{ "p_client_ref": "9f1c…", "p_lat": 51.2194, "p_lng": 4.4025,
  "p_kind": "litter", "p_size": "bag", "p_note": "Zak naast het bankje",
  "p_accuracy_m": 8.5, "p_photo_path": "inbox/2026/08/9f1c….jpg",
  "p_client": "ios", "p_app_version": "1.0.0" }
```

Antwoord (nieuw): `{ "report_id", "photo_id", "status": "published", "created_at", "nearby_count" }`

Twee antwoorden die géén fout zijn en die de app apart moet behandelen:

| Veld in antwoord | Betekenis | Wat de app doet |
| ---------------- | --------- | --------------- |
| `"idempotent": true` | zelfde `client_ref` al gepost (retry) | outbox opruimen, niets tonen |
| `"deduplicated": true` | jij meldde <24 u geleden hetzelfde binnen 15 m | "Je had dit al gemeld" + naar de bestaande melding |

### `POST /rest/v1/rpc/flag_report` — rapporteren *(auth)*

`{ "p_report_id", "p_reason", "p_detail" }` met reden `not_there` /
`wrong_location` / `inappropriate` / `spam` / `private_person` / `other`.
Bij 3 flags — of onmiddellijk bij `private_person` — gaat de melding in
quarantaine.

### `POST /rest/v1/rpc/confirm_report` — "ligt er nog" *(auth)*

### `POST /rest/v1/rpc/mark_cleaned` — opgeruimd *(auth, fase 2)*

`{ "p_report_id", "p_lat", "p_lng", "p_photo_path" }`. Staat uit tot
`app_config.cleanups_enabled` op `true` gaat.

### Edge Functions

| Endpoint | Rol |
| -------- | --- |
| `POST /functions/v1/upload-url` | geeft een signed upload-URL voor `photo-inbox` + het `storage_path` dat je aan `create_report` meegeeft. Rate limit: 30/uur/gebruiker |
| `POST /functions/v1/scan-photo` | intern, aangeroepen door de storage-webhook. Scant, verplaatst naar `photo-public`, roept `complete_photo_scan()` |
| `GET /functions/v1/export-area?bbox=…&format=geojson` | export voor gemeenten; API-key per gemeente |

## Foutcodes

PostgREST geeft de exception-message door in `message`. Codes zijn stabiel;
teksten staan in de app (`i18n/nl.json`), zodat vertalen geen backend-release is.

| Code | HTTP | Betekenis | Wat de app doet |
| ---- | ---- | --------- | --------------- |
| `not_authenticated` | 400 | geen/ongeldige sessie | anonieme sessie opnieuw aanvragen, één keer opnieuw proberen |
| `account_blocked` | 400 | geblokkeerd wegens misbruik | uitleg + contactadres, outbox leegmaken |
| `invalid_coordinates` | 400 | lat/lng buiten bereik | bug — naar Sentry, melding niet opnieuw proberen |
| `invalid_kind` | 400 | type staat niet in `enabled_kinds` | app te oud → update voorstellen |
| `size_required` | 400 | afvalmelding zonder grootte | UI moet dit voorkomen |
| `outside_service_area` | 400 | buiten het pilootgebied | "we zijn hier nog niet actief" + e-mail om regio te vragen |
| `rate_limited` | 400 | te veel meldingen (`detail`: `hour`/`day`) | wachten tonen, outbox behouden, retry na 1 u |
| `report_not_found` | 400 | verwijderd of nooit bestaan | van de kaart halen |
| `bbox_too_large` | 400 | kaartvenster te groot | uitzoomen begrenzen |
| `feature_disabled` | 400 | fase-2-functie staat uit | knop verbergen |
| `too_far_away` | 400 | te ver van de melding om ze op te ruimen (`detail`: meters) | afstand tonen |
| `already_cleaned` | 400 | iemand was je voor | verversen |
| `forbidden` | 400 | geen moderator | knop verbergen |

## Idempotentie en retries

De regel is: **de client bepaalt de identiteit van een melding**, niet de server.
`client_ref` is een uuid die de app aanmaakt op het moment dat de gebruiker op
"posten" tikt, en die bewaard blijft in de outbox. Daardoor is `create_report`
onbeperkt herhaalbaar: hetzelfde `client_ref` levert altijd dezelfde melding op.

Retrybeleid in de app:

| Situatie | Gedrag |
| -------- | ------ |
| netwerkfout, 5xx, timeout | exponentiële backoff (2 s, 4 s, 8 s, 30 s, 5 min), onbeperkt zolang de app leeft, blijft in de outbox |
| `rate_limited` | pauzeer de outbox 1 uur |
| `outside_service_area`, `invalid_*`, `size_required` | definitief; uit de outbox, fout tonen |
| `account_blocked` | outbox leegmaken, blokkadescherm |

## Versionering

De RPC-namen zijn het contract. Een breaking change krijgt een nieuwe naam
(`map_reports_v2`), waarbij de oude minstens **90 dagen** blijft leven — de tijd
die gebruikers nodig hebben om een store-update te installeren. `app_config`
bevat `min_supported_app_version`, zodat de app een harde update kan forceren
als dat toch nodig is.
