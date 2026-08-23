# 11 — Roadmap fase 2 & 3

De architectuur is zo gekozen dat deze uitbreidingen **geen** herbouw vragen.
Wat er al voor klaarligt, staat per onderdeel vermeld.

## Fase 2a — Opruimen en punten

*Al aanwezig: `cleanups`-tabel, `profiles.points`, `mark_cleaned()`,
`points_for()`, status `cleaned`, feature flag `cleanups_enabled`.*

Wat er nog moet gebeuren is bijna volledig UI: een "Ik heb dit opgeruimd"-knop
op het detailscherm, een profielscherm met punten, en de vlag op `true` zetten.

**Punten per melding** (`points_for()`): papiertje 1, zak 5, afvalhoop 15,
ander type 3. De verhouding is bewust niet lineair met de moeite: een afvalhoop
opruimen is meer dan 15 papiertjes, maar te hoge waarden maken fraude lonend.

**Fraudebeperking** — dit is het echte ontwerpprobleem van fase 2, want punten
maken van een eerlijk systeem een spel met een score:

| Aanval | Maatregel | Al geïmplementeerd |
| ------ | --------- | ------------------ |
| Punten vanaf de bank thuis | je moet binnen 75 m van de melding staan | ja, in `mark_cleaned` |
| Zelf melden en meteen opruimen | 5 minuten wachttijd op je eigen melding | ja |
| Dezelfde melding twee keer opruimen | `unique (report_id, user_id)` + status wordt `cleaned` | ja |
| Punten in de client aanpassen | punten worden server-side berekend, client stuurt ze niet | ja |
| Verzonnen meldingen om zelf op te ruimen | dedupe + rate limit + verhouding melden/opruimen per gebruiker monitoren | deels |
| GPS spoofen | mock-locatiedetectie (Android) en een limiet op de afstand tussen opeenvolgende opruimingen per tijd | nee — fase 2b |

Extra: `trust_level` stijgt bij bevestigde opruimingen, en een lage
verhouding "opgeruimd zonder bevestiging van anderen" verlaagt hem. Punten
zonder enige verificatie zijn een spel dat mensen gaan spelen; dat is te
verwachten en geen ramp, zolang de kaart er niet door vervuilt.

**Sociale laag (later, voorzichtig):** een weekklassement per gemeente en
badges. Bewust *niet* een globale ranglijst: die belonen volume, niet nut, en ze
maken bovenstaande fraude aantrekkelijk.

## Fase 2b — Voorgestelde routes

*Al aanwezig: PostGIS, `geom`-index, `kind`/`size` om kleine meldingen te
selecteren.*

Doel: "ik heb een uur, geef me een wandeling waarop ik 15 papiertjes kan
oprapen."

Aanpak in drie stappen, elk apart nuttig:

1. **Hotspots** (eenvoudig, meteen waardevol): toon met `ST_ClusterDBSCAN` de
   plekken met de hoogste concentratie kleine meldingen binnen X km. Dit is één
   SQL-query en vraagt geen routing.
2. **Route langs punten** (middelmatig): kies tot 15 meldingen binnen een
   straal, bereken een looproute met een nearest-neighbour + 2-opt-heuristiek op
   wandelafstanden. Voor de afstanden een OSRM- of Valhalla-instantie met
   wandelprofiel, of om te beginnen de hemelsbrede afstand — dat is voor een
   stadswandeling verrassend bruikbaar.
3. **Route op paden** (zwaar): echte routering over OSM-wandelpaden, met
   rondrit-optimalisatie. Enkel doen als stap 1 en 2 aantoonbaar gebruikt worden.

Architectuurimpact: een Edge Function `suggest-route`, en eventueel een eigen
routeringscontainer. De databank verandert niet.

## Fase 3 — Andere meldingstypes

*Al aanwezig: `report_kind` bevat `hazard`, `dead_animal`, `fallen_tree`,
`damaged_furniture`, `other`; `app_config.enabled_kinds` bepaalt wat de API
aanvaardt; `size_only_for_litter` laat de andere types zonder grootte bestaan.*

Aanzetten is één `UPDATE` op `enabled_kinds` plus iconen en teksten in de app.

Wat er wél nog bij moet komen:

| Type | Bijkomende eis | Waarom |
| ---- | -------------- | ------ |
| `hazard` (gevaarlijk terrein) | duidelijke disclaimer: dit is **geen** noodnummer | juridisch en ethisch essentieel — mensen mogen niet denken dat hier hulp op afkomt |
| `dead_animal` | fotowaarschuwing vóór het openen (kan schokkend zijn) | gebruikerservaring |
| `fallen_tree` | prioriteit/urgentie, want dit blokkeert een pad | de gemeente wil dit eerst zien |
| `damaged_furniture` | vrije tekst belangrijker dan grootte | het gaat om *wat* er stuk is |

Bij meerdere types wordt filteren op de kaart een vereiste in plaats van een
extra: `map_reports` heeft de `kinds`-parameter al.

Deze types raken ook de moderatie: een gemeld "gevaarlijk terrein" dat er niet
is, kost iemand een verplaatsing. `confirm_report` wordt dan belangrijker.

## Fase 3 — Gemeenteportaal

*Al aanwezig: `municipality_code` op elke melding, `municipalities`-tabel,
`export-area`-endpoint.*

De volgorde die het minste werk kost en het meeste oplevert:

1. **Export** (bestaat): GeoJSON/CSV per gemeente, met een API-key. Elke
   GIS-medewerker kan daarmee verder.
2. **Read-only webkaart per gemeente** met filters en een "opgeruimd"-knop voor
   de eigen dienst.
3. **Koppeling met hun meldingssysteem** (bv. een webhook per nieuwe melding in
   hun gebied). Pas doen als een gemeente er expliciet om vraagt — anders bouw
   je een integratie voor niemand.

Let op: zodra een gemeente meldingen *toewijst* en *opvolgt*, ben je een
workflowtool aan het bouwen, met andere eisen (accounts, rollen, SLA's,
auditlogs). Dat is een productbeslissing, geen technische. De architectuur
blokkeert het niet, maar doe het niet per ongeluk.

## Wat we bewust nooit doen

| Niet doen | Waarom |
| --------- | ------ |
| Achtergrondlocatie / meldingen automatisch detecteren | privacyverlies, batterijverbruik, store-risico, en het lost geen echt probleem op |
| Openbaar profiel met naam en foto bij meldingen | maakt van een netheidskaart een sociaal netwerk, met alle moderatielast erbij |
| Melders belonen voor het *aantal* meldingen | dan wordt melden het doel en vervuilt de kaart |
| Gebruikers laten zien wie wat meldde | de anonimiteit is een kernbelofte |
| Advertenties of doorverkoop van data | vernietigt het vertrouwen dat het hele product draagt |
