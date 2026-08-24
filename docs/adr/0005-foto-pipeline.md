# ADR 0005 — Twee-bucket fotopijplijn met scan vóór publicatie

**Status:** aanvaard · **Datum:** 2026-08-23

## Context

Gebruikers kunnen een foto meegeven, en die foto komt op een openbare kaart.
Drie risico's die alle drie echt zijn:

1. EXIF-metadata bevat GPS, toestel-id en tijdstempel.
2. Iemand fotografeert een herkenbare persoon, een nummerplaat, of een
   privéwoning.
3. Iemand uploadt doelbewust ongepaste inhoud.

Een openbare kaart met ongefilterde gebruikersfoto's is niet
roll-out-waardig — noch juridisch, noch tegenover de eerste gebruiker die
zichzelf terugvindt.

## Opties

| Optie | Nadeel |
| ----- | ------ |
| Direct publiceren, achteraf modereren | er is een venster waarin iedereen de foto ziet; bij een persoon op de foto is dat venster het probleem |
| Alles vooraf handmatig modereren | melding is uren onbruikbaar; niet houdbaar bij groei |
| **Melding direct publiceren, foto pas na een automatische scan** | vraagt een extra bucket en een webhook |
| Geen foto's | verliest de belangrijkste informatie voor de opruimer ("hoe groot is het?") |

## Beslissing

De **melding** is onmiddellijk zichtbaar; de **foto** pas na een automatische
veiligheidsscan.

```
camera → client: 1600 px, JPEG q80 (EXIF verdwijnt)
       → photo-inbox   (privé, géén leespolicy)
       → scan-photo    (storage-webhook)
          ├─ veilig    → photo-public (CDN) + scan_status='safe'
          ├─ verdacht  → scan_status='flagged' + melding in quarantaine
          └─ vastgelopen → na 24 u 'failed', nooit gepubliceerd
```

Drie eigenschappen maken dit veilig:

1. **EXIF verdwijnt op het toestel.** Het re-encoderen naar JPEG is niet alleen
   compressie; het strippen van metadata gebeurt vóór de foto het toestel
   verlaat. De enige locatie die wij hebben, is die van de melding zelf.
2. **`photo-inbox` heeft geen leespolicy.** Zelfs met een geldig token krijg je
   er niets uit. Alleen `service_role` (de scanner) leest daar.
3. **Falen is restrictief.** Er bestaat geen pad waarlangs een ongescande foto
   publiek wordt. Bij twijfel geven we beschikbaarheid op, niet veiligheid.

## Gevolgen

- De gebruiker wacht niet: hij post, de pin staat er, en de foto verschijnt
  seconden later (met een blurhash als placeholder).
- Extra afhankelijkheid: een vision-API. Dat is een subverwerker en moet in het
  verwerkingsregister en de privacyverklaring; kies een EU-regio.
- `report_photos` heeft `bucket` én `path`, dus verhuizen naar Cloudflare R2 is
  een storagemigratie, geen appmigratie.
- Kost: ±€ 0,50–1 per 1 000 afbeeldingen. Bij 50 000 meldingen/jaar met 45 %
  foto's is dat verwaarloosbaar tegenover het risico dat het wegneemt.
- Een aparte rapportreden `private_person` zet een melding **onmiddellijk** in
  quarantaine — één klacht is genoeg. De scan vangt niet alles, en dat is de
  vangnetregel.
