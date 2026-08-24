# ADR 0003 — Anonieme, device-gebonden identiteit

**Status:** aanvaard · **Datum:** 2026-08-23

## Context

Melden moet lukken in vijftien seconden, zonder registratie: een inlogscherm is
de grootste drempel die er is. Tegelijk kan een systeem waarin niemand
identificeerbaar is, geen rate limits afdwingen, geen spammer blokkeren, en in
fase 2 geen punten toekennen.

## Opties

1. **Geen enkele identiteit** — melden met de publieke anon key. Eenvoudig, maar
   onbeschermd: één script kan de kaart volpompen en er is geen enkele knop om
   dat te stoppen.
2. **Verplicht account** (e-mail of social login) — makkelijk te modereren,
   maar het kost je het grootste deel van je melders.
3. **Anonieme auth met een device-gebonden account**, later opwaardeerbaar naar
   een echt account.
4. Zelfgemaakte device-id in de app — te makkelijk te wissen of te vervalsen, en
   het geeft geen token dat de databank kan vertrouwen.

## Beslissing

**Optie 3: Supabase anonieme auth.** Bij de eerste start doet de app stil
`signInAnonymously()`. Dat geeft een echte gebruiker met een uuid en een JWT,
zonder dat de gebruiker iets invult of iets over zichzelf prijsgeeft.

Publiek blijft alles anoniem: geen enkel API-antwoord bevat de melder.
`report_details` geeft enkel `is_mine`, server-side bepaald uit het token.

## Gevolgen

**Wat het mogelijk maakt**

- Rate limits per account (15/uur, 40/dag) in `create_report`.
- `block_user` bij misbruik.
- Deduplicatie van je *eigen* meldingen.
- "Mijn meldingen" zonder account.
- Fase 2: punten op een profiel dat al bestaat, en een `link identity`-stap
  (e-mail toevoegen) waarbij de geschiedenis behouden blijft.

**Wat het kost**

- De sessie zit op het toestel. App verwijderen of een nieuw toestel = nieuwe
  identiteit, en "mijn meldingen" is weg. Dit is bekend gedrag, het staat in
  scenario 26 van het testplan, en het moet in de app uitgelegd worden.
- Het is geen sterke verificatie: wie doelbewust wil, maakt nieuwe anonieme
  accounts. Daarom staat de IP-hash er (30 dagen) naast, en komt in fase 1.5
  App Attest / Play Integrity erbij.
- De sessie moet in `expo-secure-store`, niet in AsyncStorage — anders verliezen
  gebruikers hun meldingen bij een cache-opruiming.

## Waarom niet gewoon een IP-adres bewaren?

Een IP is een persoonsgegeven, en het opslaan van ruwe IP's bij openbare
meldingen is een veel grotere privacy-ingreep dan een anonieme uuid. Daarom
bewaren we enkel een **hash** met roterend salt, 30 dagen, in een tabel die
voor clients volledig onleesbaar is (`report_audit` heeft geen enkele
RLS-policy). Genoeg om misbruik te correleren, niet genoeg om iemand te vinden.
