# ADR 0008 — Publiceren-dan-modereren met automatische quarantaine

**Status:** aanvaard · **Datum:** 2026-08-23

## Context

Meldingen zijn openbaar en anoniem. Dat is de kern van het product en tegelijk
de opening voor misbruik: valse meldingen, ongepaste foto's, foto's van
personen. De moderatiecapaciteit in de piloot is één persoon met een dagtaak
elders.

## Opties

| Model | Voordeel | Nadeel |
| ----- | -------- | ------ |
| Vooraf modereren | niets ongepasts komt ooit online | melding is uren onbruikbaar; product verliest zijn nut ("snel kunnen oppikken"); niet schaalbaar met één moderator |
| **Publiceren, dan modereren, met automatische quarantaine** | melding is meteen nuttig; misbruik verdwijnt snel en meestal zonder mens | er bestaat een klein venster |
| Alleen achteraf, handmatig | minste werk vooraf | het venster is zo groot als de reactietijd van één persoon |
| Volledig geautomatiseerd | schaalt | classifiers zitten er soms naast; zonder beroepsmogelijkheid is dat onredelijk |

## Beslissing

**Publiceren-dan-modereren, met geautomatiseerde quarantaine als eerste lijn.**
De mens beslist alleen in de gevallen die de automaat niet kan afhandelen.

| Trigger | Gevolg | Wie |
| ------- | ------ | --- |
| Foto afgekeurd door de scan | melding onmiddellijk in quarantaine | automatisch |
| 1× reden `private_person` | melding onmiddellijk in quarantaine | automatisch |
| 3 flags (`auto_quarantine_flags`) | melding in quarantaine | automatisch |
| `restore` / `remove` | definitief | moderator |
| Herhaald misbruik | `block_user`, standaard 30 dagen | moderator |

Waarom `private_person` één klacht nodig heeft en de rest drie: bij een foto
waarop iemand herkenbaar staat, is de schade al aan het gebeuren terwijl je op
een tweede klacht wacht. Bij "ligt er niet meer" is dat niet zo — daar is een
vergissing waarschijnlijker dan misbruik.

De keerzijde: één `private_person`-flag van eender welk account verbergt een
melding meteen — dat is óók een goedkoop censuurkanaal. Aanvaard voor v1,
omdat een onterecht verborgen melding minder schade doet dan een terecht
geklaagde foto die blijft staan; geblokkeerde accounts kunnen niet flaggen, en
wie het misbruikt wordt geblokkeerd.

Alle drempels staan in `app_config` en zijn **zonder deploy** aanpasbaar. Bij
een aanval wil je de drempel in dertig seconden op 1 kunnen zetten.

## Reactietermijnen

| Categorie | Termijn |
| --------- | ------- |
| `private_person` | 24 uur |
| Overige quarantaine | 72 uur |

Een alert vuurt als het oudste item ouder is dan 48 uur. Een termijn zonder
alarm is een intentie, geen afspraak.

## Fase 2 — als het handmatig niet meer gaat

Trigger: meer dan 20 quarantaine-items per dag.

1. **Vertrouwde melders.** `trust_level` stijgt met bevestigde meldingen zonder
   klachten. Hun meldingen krijgen een hogere flagdrempel; nieuwe accounts een
   lagere. De velden staan er al.
2. **Community-verificatie.** `confirm_report` bestaat al; bij voldoende
   bevestigingen van verschillende gebruikers wordt een melding "bevestigd" en
   moeilijker te verbergen met flags.
3. **Automatisch archiveren.** Een melding die drie keer `not_there` krijgt en
   ouder is dan 30 dagen, gaat automatisch naar `removed` — die heeft
   waarschijnlijk gewoon geen mens meer nodig.

## Gevolgen

- Elke handeling landt in `moderation_events`, met actor en reden. Zonder
  auditspoor kan je een klacht over moderatie niet weerleggen.
- Quarantaine is **omkeerbaar** (`restore`); verwijderen bewaart de rij voor
  audit. Onherstelbaar verwijderen is nooit de eerste stap.
- Een gequarantineerde melding blijft zichtbaar voor de melder zelf, met de
  reden. Anders lijkt het alsof zijn melding verdwenen is, en dat kost je een
  gebruiker.
- Een takedown-e-mailadres in de app en in de store-listing is verplicht — voor
  beide stores én voor mensen zonder de app.
