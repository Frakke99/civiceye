# 12 — Kosten

Alle bedragen zijn indicaties per maand, exclusief btw, op basis van de
publieke tarieven van de gekozen diensten. Ze zijn bedoeld om te beslissen,
niet om te budgetteren tot op de euro.

## Fase 0–1 — ontwikkeling en gesloten beta

| Post | Keuze | Kost |
| ---- | ----- | ---- |
| Supabase | gratis plan (2 projecten) | € 0 |
| MapTiler | gratis plan (100 k tile-requests/maand) | € 0 |
| Sentry | Developer-plan | € 0 |
| Vercel (web) | Hobby | € 0 |
| Foto-scan | gratis tier van de vision-API | € 0 |
| Apple Developer Program | verplicht om op iOS te testen | **€ 99/jaar** |
| Google Play Developer | eenmalig | **€ 25** |
| EAS Build | gratis tier (beperkt aantal builds) of € 0 met lokale builds | € 0 |
| **Totaal** | | **≈ € 10/maand** (afschrijving van de storekosten) |

De storekosten zijn niet vermijdbaar: zonder Apple Developer Program kan je niet
via TestFlight op een iPhone testen.

## Fase 2 — open beta (± 500 gebruikers, 5 000 meldingen)

| Post | Keuze | Kost |
| ---- | ----- | ---- |
| Supabase | **Pro** — nodig voor backups en PITR op prod | € 25 |
| Supabase | staging op het gratis plan | € 0 |
| MapTiler | gratis plan volstaat nog net; anders Flex | € 0–20 |
| Sentry | Team | € 0–26 |
| Vercel | Hobby | € 0 |
| Foto-scan | ±5 000 afbeeldingen | € 5–10 |
| EAS Build | Production-plan of lokale builds | € 0–29 |
| **Totaal** | | **≈ € 30–110/maand** |

Het Pro-plan van Supabase is het eerste punt waarop je echt moet betalen, en het
is de moeite: zonder point-in-time recovery is een slechte migratie op
productiedata onherstelbaar.

## Fase 3 — publiek (± 5 000 gebruikers, 50 000 meldingen)

| Post | Kost | Opmerking |
| ---- | ---- | --------- |
| Supabase Pro | € 25 + verbruik | databank blijft klein: 50 k meldingen ≈ 50 MB |
| Storage + egress | € 5–25 | dít is de post die groeit — zie hieronder |
| MapTiler | € 20–100 | schaalt met tile-requests, niet met gebruikers |
| Sentry | € 26 | |
| Foto-scan | € 25–50 | ±50 k afbeeldingen |
| Domein + e-mail | € 3 | |
| **Totaal** | **≈ € 105–230/maand** | |

### De post die het eerst uit de hand loopt: foto's

Eén foto is 150–400 kB na verkleinen. Bij 50 000 meldingen met 45 % foto's is
dat ±7 GB opslag — verwaarloosbaar. Het probleem is **egress**: elke keer dat
iemand een detailvenster opent, wordt een foto opgehaald.

Drie maatregelen, in volgorde van effect:

1. **Thumbnails op de kaart, volledige foto alleen in het detailvenster.**
   Supabase Storage-transformaties leveren een 200 px-variant; die is ~15 kB.
2. **Blurhash als placeholder**, zodat het detailvenster niet op de foto wacht.
3. **CDN-cachetijd hoog zetten** (foto's veranderen nooit na de scan):
   `Cache-Control: public, max-age=31536000, immutable`.

Loopt het alsnog op, dan is de uitstap Cloudflare R2 (geen egresskosten) met
Cloudflare Images. Dat is een migratie van de storagelaag, niet van de app: de
buckets zitten achter `bucket` + `path` in `report_photos`.

## Kostenbewaking

| Maatregel | Waarom |
| --------- | ------ |
| Budget-alert op elke dienst (Supabase, MapTiler, vision-API) | een lek in een tile-cache kan een rekening verdubbelen |
| Rate limits op `upload-url` (30/uur) | beperkt de bovengrens van de duurste post |
| `bbox_too_large` + rijcaps | voorkomt dat een scraper je verbruik bepaalt |
| Maandelijks: kosten per 1 000 meldingen berekenen | maakt de kosten voorspelbaar per groei, niet per verrassing |

## Verborgen kosten die geen factuur hebben

Realistisch blijven: het duurste onderdeel van dit project is niet de
infrastructuur.

| Post | Inschatting |
| ---- | ----------- |
| Moderatie | 15–30 min/dag in de open beta |
| Store-reviews en -afwijzingen | 1–3 iteraties bij de eerste inzending |
| Juridisch (privacyverklaring, DPIA) | eenmalig, enkele dagen of een adviseur |
| Support (e-mails van gebruikers) | groeit lineair met het aantal gebruikers |
