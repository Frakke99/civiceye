# ADR 0004 — MapLibre met server-side clustering via bbox-RPC

**Status:** aanvaard · **Datum:** 2026-08-23

## Context

De kaart is het product. Ze moet op een low-end Android vlot zijn, van
landniveau tot straatniveau werken, en niet duurder worden per gebruiker.

## Beslissing 1 — MapLibre, niet Google Maps of Mapbox

| | MapLibre + MapTiler | Google Maps | Mapbox |
| --- | --- | --- | --- |
| Kosten | per tile-request, gratis tier ruim | per kaartlading | per maandelijkse actieve gebruiker |
| Zelfde renderer op iOS/Android/web | ja | nee (web anders) | ja |
| Tiles verwisselbaar | ja (MapTiler, Protomaps, zelf) | nee | beperkt |
| Wandelpaden in de stijl | ja (`outdoor`) | beperkt | ja |

Facturatie per actieve gebruiker is bij een gratis publieke app een
onvoorspelbaar risico; per tile-request is begrensbaar (cachen, zoombereik
beperken). En dezelfde renderer op alle platformen betekent dat een kaartbug op
één platform ook op de andere reproduceerbaar is.

## Beslissing 2 — clusteren op de server, niet op de client

| | server-side (gekozen) | client-side (supercluster) | vector tiles (MVT) |
| --- | --- | --- | --- |
| Data over de lijn | max 800 rijen | álle punten in het venster | per tegel, cachebaar |
| Werk op het toestel | tekenen | tekenen + clusteren | tekenen |
| Complexiteit | laag | laag | midden (tile-endpoint + CDN) |
| Schaalt naar 1M meldingen | met de clustercache | nee | ja |

Client-side clusteren vraagt alle punten in het venster op. Bij een uitgezoomde
weergave met 100 000 meldingen is dat tientallen megabytes over een mobiel
netwerk — onbruikbaar. Server-side clusteren stuurt altijd maximaal 800 rijen,
ongeacht het volume.

MVT-tiles zijn de betere eindoplossing, maar niet nu: ze vragen een
tile-endpoint, cache-invalidatie en CDN-configuratie, en de gemeten cijfers
zeggen dat het voor v1 niet nodig is.

## Beslissing 3 — rastergrootte `360° / 2^(zoom+2)`

Vier bij vier cellen per kaarttegel. Dat getal is gekozen op markerdichtheid,
niet op gevoel: het geeft ongeveer **48 markers in een telefoonviewport op elk
zoomniveau**. Een fijner raster (8×8 of 16×16 per tegel) gaf 192 tot 768 markers
per venster — te veel om te tekenen en te veel rijen om te versturen.

Vanaf zoom 14 schakelt de query over naar losse meldingen (max 600), want dan
wil je individuele pins kunnen aantikken.

## Onderbouwing met metingen

`db/test/20_perf.sql`, Postgres 16 + PostGIS 3.4:

| Meldingen | zoom 16 | zoom 12 | zoom 8 |
| --------- | ------- | ------- | ------ |
| 50 000 | 3 ms | 10 ms | 104 ms |
| 500 000 | 2 ms | 25 ms | 712 ms |

De ingezoomde weergave — waar gebruikers vrijwel altijd zitten — blijft ook bij
een half miljoen meldingen ruim binnen de SLO. Alleen de uitgezoomde aggregatie
loopt uit de hand.

## Gevolgen

- Eén partiële GiST-index draagt de hele kaart. Die index bewaken is de
  belangrijkste performance-taak.
- Het opschaalpad ligt klaar en is gemeten: `db/scale/0100_cluster_cache.sql`
  brengt zoom 8 bij 500 000 meldingen van 712 ms naar 2,4 ms, en
  `db/test/30_cluster_cache.sql` bewijst dat de tellingen identiek blijven.
  Aan- en uitzetten is één `UPDATE` op `app_config`.
- Clustertellingen aan de rand van het venster bevatten hele cellen. Dat is een
  bewuste keuze: markers mogen niet verdwijnen tijdens het pannen.
