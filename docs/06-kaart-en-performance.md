# 06 — Kaart & performance

## Kaartlagen

| Laag | Technologie | Opmerking |
| ---- | ----------- | --------- |
| Achtergrond | MapTiler vector tiles (`streets-v2` of `outdoor-v2`) | outdoor toont wandelpaden — relevant voor de doelgroep |
| Renderer | MapLibre GL (native op iOS/Android, `maplibre-gl` op web) | open source, geen vendor-lock, geen sessiekosten per gebruiker |
| Meldingen | eigen laag uit `map_reports` | GeoJSON-source, symbol layer |

MapLibre en niet Google Maps/Mapbox: geen per-sessie-facturatie, dezelfde
renderer op alle drie de platformen, en tiles zijn verwisselbaar (MapTiler,
Protomaps of zelf gehost) zonder de app te herschrijven.
Zie [ADR 0004](adr/0004-kaart-en-clustering.md).

## Clustering

Clustering gebeurt **server-side**, in SQL. Punten worden op een zoomafhankelijk
raster gesnapt en per cel geteld.

De rastergrootte is `360° / 2^(zoom+2)` — 4×4 cellen per kaarttegel. Dat is
geen willekeurig getal; het is gekozen op markerdichtheid:

| Zoom | Celgrootte | Markers in een telefoonviewport |
| ---- | ---------- | ------------------------------- |
| 5 | 312 km | ~48 |
| 8 | 39 km | ~48 |
| 11 | 4,9 km | ~48 |
| 13 | 1,2 km | ~48 |
| ≥14 | — | losse meldingen, max 600 |

Het raster schaalt mee met de zoom, dus de kaart toont op elk niveau ongeveer
even veel markers. Een fijner raster (8×8 of 16×16 per tegel) gaf 192 tot 768
markers per venster: te veel om te tekenen en te veel rijen om over te sturen.

Bij zoom 14 en hoger schakelt de query over naar losse meldingen, want dan wil
je ze individueel kunnen aantikken.

### Waarom niet client-side clusteren (supercluster)?

Dat vraagt álle punten in het venster naar het toestel. Bij een uitgezoomde
weergave met 100 000 meldingen is dat tientallen megabytes. Server-side
clusteren stuurt maximaal 800 rijen, ongeacht het volume.

## Gemeten performance

`db/test/20_perf.sql` genereert 50 000 meldingen (of een ander aantal via
`-v n=500000`), geclusterd rond
12 Vlaamse steden (clustering is precies wat de aggregatie zwaar maakt), en
meet met `EXPLAIN (ANALYZE)`. Postgres 16 + PostGIS 3.4.

| Meldingen | zoom 16 (punten) | zoom 12 | zoom 8 (uitgezoomd) | `nearby_reports` |
| --------- | ---------------- | ------- | ------------------- | ---------------- |
| 50 000 | 3 ms | 10 ms | 104 ms | 0,7 ms |
| 500 000 | 2 ms | 25 ms | **712 ms** | 0,7 ms |

Conclusie: de ingezoomde weergave — waar gebruikers 95 % van hun tijd zitten —
blijft ook bij een half miljoen meldingen onder 25 ms. Alleen de uitgezoomde
aggregatie loopt uit de hand, omdat die per query alle punten in het venster
moet aanraken.

Met het verwachte volume voor jaar 1 (A2 in [01](01-product-scope.md):
maximaal enkele tienduizenden meldingen) zit alles ruim binnen de SLO van
300 ms. **Er is dus geen tile-infrastructuur nodig voor de eerste roll-out.**

## Opschaalpad

Drie stappen, elk met een concrete trigger. Stap 1 is al geschreven en getest.

### Stap 1 — clustercache (`db/scale/0100_cluster_cache.sql`)

**Trigger:** p95 van `map_reports` boven 400 ms, of >100 000 actieve meldingen.

Een materialized view aggregeert de zoomniveaus 5–11 vooraf; `map_reports` leest
die in plaats van live te aggregeren. Zoom 12+ blijft live, zodat een nieuwe
melding onmiddellijk zichtbaar is waar dat telt.

| | zoom 8 bij 500 000 meldingen |
| --- | --- |
| live aggregatie | 712 ms |
| uit de clustercache | **2,4 ms** |

Verversen kost ~8 s (`REFRESH ... CONCURRENTLY`, dus zonder de kaart te
blokkeren) en draait elke 5 minuten via pg_cron. `db/test/30_cluster_cache.sql`
bewijst dat cache en live query op elk zoomniveau exact hetzelfde aantal
meldingen tellen. Aanzetten en terugdraaien is één `UPDATE` op `app_config`.

### Stap 2 — vector tiles op een CDN

**Trigger:** >1 000 gelijktijdige gebruikers, of de databank wordt merkbaar
belast door leesverkeer.

Een Edge Function `GET /tiles/{z}/{x}/{y}.pbf` die `ST_AsMVT` gebruikt, met
`Cache-Control: public, max-age=60`. Vanaf dat moment vangt de CDN het
overgrote deel van het leesverkeer op en groeit de last niet meer met het
aantal gebruikers, maar met het aantal unieke tegels.

### Stap 3 — leesreplica of aparte read-service

**Trigger:** schrijfverkeer en leesverkeer beginnen elkaar te hinderen.

Supabase biedt read replicas op de betalende plannen; de kaartquery's zijn
allemaal `stable` en kunnen zonder aanpassing naar een replica.

## Clientzijdige performance

| Maatregel | Effect |
| --------- | ------ |
| Bbox-keys afronden op een raster | pannen hergebruikt de cache in plaats van elke pixel opnieuw te laden |
| 30 s stale-time op markers | terug-navigeren naar de kaart is instant |
| Query annuleren bij snel pannen (AbortController) | geen stapel verouderde antwoorden |
| Markers als één GeoJSON-source, niet als losse componenten | MapLibre tekent in één pass |
| Blurhash-placeholder voor foto's | detailvenster voelt onmiddellijk |
| Tiles offline cachen (MapLibre-cache) | de kaart blijft leesbaar zonder netwerk — precies wat je op een wandelpad nodig hebt |

## Budgetten

| Wat | Budget | Bewaakt door |
| --- | ------ | ------------ |
| `map_reports` p95 | 300 ms | [SLO](09-observability-en-slo.md) |
| Antwoordgrootte kaartquery | < 100 kB | cap van 600 punten / 800 clusters |
| Tijd tot eerste kaartweergave | 1,5 s op 4G | client-event `map_first_paint` |
| Web-bundelgrootte | < 40 MB | CI faalt boven de limiet |
| Tiles per gebruiker per maand | < 1 500 | MapTiler-dashboard; bepaalt de kosten ([12](12-kosten.md)) |
