# ADR 0006 — Offline-first outbox met idempotente writes

**Status:** aanvaard · **Datum:** 2026-08-23

## Context

De app wordt gebruikt op wandelpaden, in bossen en langs velden — precies de
plekken met het slechtste bereik. Als melden daar niet werkt, werkt het product
niet. Erger nog: een melding die "leek te lukken" maar verloren ging, kost
onmiddellijk het vertrouwen.

## Beslissing

Elke melding gaat eerst naar een **lokale outbox** (SQLite via `expo-sqlite`) en
wordt daarna verstuurd. De outbox is de bron van waarheid tot de server bevestigt.

```
outbox(client_ref PK, payload, photo_uri, attempts, next_attempt_at, last_error)
```

De sleutel van het ontwerp is dat **de client de identiteit van de melding
bepaalt**: `client_ref` is een uuid die wordt aangemaakt op het moment dat de
gebruiker op "posten" tikt. In de databank staat
`unique (created_by, client_ref)`, en `create_report` geeft bij een tweede
aanroep met hetzelfde `client_ref` gewoon de bestaande melding terug met
`idempotent: true`.

Daardoor is retryen **onvoorwaardelijk veilig**. Er is geen scenario — netwerk
dat halverwege wegvalt, app die gekilld wordt na het versturen maar voor het
antwoord, dubbele tik — waarin twee meldingen ontstaan.

## Gevolgen

- Synchronisatie wordt getriggerd door: app naar de voorgrond, netwerk terug
  (`expo-network`), en een timer op `next_attempt_at`.
- Backoff: 2 s, 4 s, 8 s, 30 s, 5 min, daarna elk kwartier. Onbeperkt, want een
  melding weggooien is nooit het juiste antwoord.
- Onderscheid tussen **tijdelijke** en **definitieve** fouten is verplicht:
  `rate_limited` pauzeert een uur, `outside_service_area` en `invalid_*` halen
  het item uit de outbox met een zichtbare uitleg. Zonder dat onderscheid
  hamert de app eeuwig op een melding die nooit zal lukken.
- De foto gaat eerst; lukt de upload niet, dan gaat de melding **zonder** foto
  door. Een melding zonder foto is nuttig; een melding die blijft hangen op een
  mislukte upload niet.
- De wachtrij is **zichtbaar** in de UI ("1 melding wacht op verbinding"). Een
  onzichtbare wachtrij voelt als dataverlies, ook als de data er nog is.
- Op web is er geen achtergrondsync: de outbox loopt enkel zolang het tabblad
  open is. Dat is een aanvaarde beperking van de PWA-testweg.

## Wat we niet doen

Geen generiek sync-framework (WatermelonDB, Replicache, PowerSync). De outbox is
één tabel met vijf kolommen en één richting: van toestel naar server. Meldingen
worden na het posten nooit lokaal gewijzigd. Een sync-engine zou hier meer
complexiteit toevoegen dan hij wegneemt.
