# 14 — Store-voorbereiding

Alles wat de stores vragen vóór TestFlight/Play-internal en de publieke
roll-out. De teksten hieronder zijn klaar om te plakken; de stappen met 👤
vragen een account en kunnen alleen door de eigenaar gedaan worden.

## Buildprofielen (EAS)

`apps/mobile/eas.json` heeft drie profielen:

| Profiel | Doel |
| ------- | ---- |
| `development` | development build met de native modules (MapLibre), intern |
| `preview` | installeerbare testbuild voor TestFlight / Play internal |
| `production` | storebuild, versienummer telt automatisch op |

👤 Eenmalig: `npm i -g eas-cli`, `eas login`, `eas build:configure`, en de
projectkoppeling (`eas init`) — dat schrijft een `projectId` in `app.json`.
Daarna: `eas build --profile preview --platform android` (of `ios`; iOS vraagt
het Apple Developer Program, € 99/jaar).

## Listingtekst (NL)

**Naam:** CivicEye

**Ondertitel / korte beschrijving (max 80 tekens):**
Zwerfvuil gezien? Meld het in 15 seconden, anoniem, op de kaart.

**Beschrijving:**

> Zwerfvuil melden zou geen moeite mogen kosten. Met CivicEye zet je een
> melding op de kaart in minder dan vijftien seconden: pin op de juiste plek,
> grootte aantikken, klaar. Geen account, geen formulieren.
>
> - **Anoniem.** Geen registratie; niets in een melding verwijst naar jou.
> - **Werkt ook zonder bereik.** Op een wandelpad zonder netwerk wordt je
>   melding bewaard en automatisch verstuurd zodra je weer verbinding hebt.
> - **Foto erbij?** Die wordt verkleind en zonder metadata verstuurd, en pas
>   getoond na een automatische controle.
> - **Voor opruimers en gemeenten.** De kaart is openbaar: wie wil opruimen,
>   ziet meteen waar het nodig is.
>
> CivicEye start als piloot in de regio Antwerpen en de Kempen.

**Trefwoorden (iOS):** zwerfvuil, afval, melden, sluikstort, opruimen, kaart,
proper, buurt

## Privacylabels

Gebaseerd op wat de app écht doet (docs/07, ADR 0003/0005). Niets wordt aan
een identiteit gekoppeld en niets dient voor tracking of advertenties.

| Gegeven | Apple (App Privacy) | Google (Data safety) | Doel |
| ------- | ------------------- | -------------------- | ---- |
| Locatie van de melding (precies) | Location → Precise Location, *not linked to you* | Location → Precise, verzameld | app-functionaliteit (de melding zelf) |
| Foto (optioneel, EXIF gestript) | User Content → Photos, *not linked to you* | Photos | app-functionaliteit |
| Anonieme gebruikers-id | Identifiers → User ID, *not linked to you* | Device or other IDs | misbruikbeperking (rate limits, blokkade) |
| IP-hash (30 dagen, nooit ruw) | niet van toepassing — zie toelichting bij review | Data collected ephemerally | misbruikbeperking |
| Tracking | **nee** | **nee** | — |

## Reviewrisico's en hun antwoord

| Vraag van de reviewer | Antwoord |
| --------------------- | -------- |
| Waarom locatie? | alleen bij gebruik, om de pin van een melding te zetten; geen achtergrondlocatie (zie de permissietekst in `app.json`) |
| Waarom camera/foto's? | optionele foto bij een melding; werkt ook zonder |
| Account deletion (Apple 5.1.1(v)) | er ís geen account met persoonsgegevens; de anonieme identiteit bevat niets herleidbaars. Voor de volledigheid komt er vóór de publieke roll-out een "wis mijn gegevens"-knop die het anonieme profiel en de eigen meldingen verwijdert — staat op de lijst voor sprint 6. |
| Moderatie van user content (UGC-regels) | rapporteren zit in de app, automatische quarantaine, beheerdersconsole, takedown binnen 24 u bij herkenbare personen (ADR 0008) |

## Screenshots (per store 5–8 stuks)

1. Kaart met clusters (zoom op Antwerpen)
2. Meldflow — locatiestap met de pin
3. Meldflow — de drie groottes
4. Detail van een melding met foto
5. "Mijn meldingen" met de offline wachtrij zichtbaar
6. Privacyscherm (het anonieme verhaal is een verkoopargument)

Maak ze van de webbuild op telefoonformaat (390×844) of van een device-build;
de e2e-screenshotaanpak uit de repo werkt hiervoor.

## Nog open vóór publieke roll-out

- 👤 Contactadres invullen in de privacyverklaring (`privacy.contact` in
  `apps/mobile/src/i18n/nl.json`) én in beide store-listings (verplicht veld).
- 👤 Apple Developer Program en Google Play Developer-account.
- "Wis mijn gegevens" in de app (zie reviewtabel) — sprint 6.
- Echte vision-API in `scan-photo` (nu de mock) vóór er echte gebruikersfoto's
  publiek gaan.
