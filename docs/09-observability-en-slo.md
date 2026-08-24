# 09 — Observability & SLO's

Doel: binnen vijf minuten weten *dat* er iets stuk is, en binnen vijftien
minuten *wat*. Niet meer — dashboards die niemand bekijkt zijn geen observability.

## SLO's

| SLI | Doel | Meetvenster | Foutbudget |
| --- | ---- | ----------- | ---------- |
| Beschikbaarheid van de kaart (`map_reports` slaagt) | 99,5 % | 30 d | ≈3,6 u |
| `map_reports` p95 | < 300 ms | 7 d | — |
| `create_report` slaagt (excl. bewuste domeinfouten) | 99,9 % | 30 d | ≈43 min |
| Crash-vrije sessies | > 99,5 % | 7 d | — |
| Foto van upload tot publicatie | p95 < 60 s | 7 d | — |
| Oudste item in de moderatiewachtrij | < 72 u (< 24 u bij `private_person`) | continu | — |

`create_report` heeft een strengere doelstelling dan de kaart, en dat is
opzettelijk: een kaart die even niet laadt is hinder, een melding die verloren
gaat is verlies van vertrouwen. De outbox is daar de tweede verdedigingslijn.

## Wat we meten

| Laag | Gereedschap | Wat |
| ---- | ----------- | --- |
| App | Sentry (crashes, JS-fouten, trage transacties) | crashes per release, foutmeldingen per foutcode |
| App | PostHog (opt-in) | funnel kaart→melden→gepost, waar mensen afhaken |
| API | Supabase logs + pg_stat_statements | latency per RPC, langzaamste query's |
| Foto's | scan-photo logt duur en uitkomst | scanduur, aandeel `flagged` |
| Uptime | externe check elke minuut op `map_reports` | echte beschikbaarheid van buiten |
| Databank | Supabase-dashboard | verbindingen, schijf, cachehit |

### Zelfgebouwde productmetrieken

Een dagelijkse query volstaat en is beter dan een BI-tool die niemand opent:

```sql
select date_trunc('day', created_at)::date              as dag,
       count(*)                                        as meldingen,
       count(distinct created_by)                       as melders,
       count(*) filter (where photo_count > 0)          as met_foto,
       count(*) filter (where status = 'quarantined')   as quarantaine,
       round(avg(accuracy_m)::numeric, 1)               as gem_gps_nauwkeurigheid,
       count(*) filter (where created_client = 'ios')   as ios,
       count(*) filter (where created_client = 'android') as android,
       count(*) filter (where created_client = 'web')   as web
from public.reports
where created_at > now() - interval '30 days'
group by 1 order by 1 desc;
```

`created_client` erbij houden is geen luxe: bij een device-specifieke bug zie je
in deze tabel meteen dat het aandeel Android instort.

## Alerts

Alleen alerts waarop je iets kán doen. Vijf stuks:

| Alert | Drempel | Actie |
| ----- | ------- | ----- |
| Kaart onbereikbaar | 3 mislukte checks op rij | Supabase-status, dan rollback van de laatste release |
| Foutgraad `create_report` | > 2 % over 15 min (excl. domeinfouten) | logs bekijken; is het één toestel of iedereen? |
| Crashgraad | > 1 % van de sessies in een release | EAS Update terugrollen |
| Moderatiewachtrij te oud | oudste item > 48 u | wachtrij leegmaken |
| Foto's vastgelopen | > 10 met `pending` ouder dan 1 u | scanner nakijken |

Alerts komen op één kanaal (e-mail of Telegram). Bij één beheerder is
alert-routing zinloze complexiteit.

## Logbeleid

- **Nooit loggen:** JWT's, de `service_role`-key, ruwe IP-adressen, exacte
  coördinaten van een melding samen met een gebruikers-id.
- **Wel loggen:** `report_id`, foutcode, duur, platform, app-versie.
- Sentry: `sendDefaultPii: false`, en een `beforeSend` die coördinaten en
  tokens uit de payload strippen. Zet dat op dag één, niet na het eerste lek.
- Bewaartermijn van logs: 30 dagen — gelijk aan `report_audit`, zodat er geen
  achterdeur ontstaat waarlangs data langer blijft dan je belooft.

## Wat we in de piloot wekelijks nakijken

Een korte lijst is beter dan een dashboard: aantal meldingen en unieke melders,
aandeel met foto, aandeel quarantaine, p95-latency van de twee hoofdquery's,
crashgraad per platform, en de vijf meest voorkomende foutcodes. Als een van die
zes iets vreemds doet, weet je waar je moet kijken.
