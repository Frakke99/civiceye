-- 20_perf.sql — performancecheck op de kaartquery met realistisch volume.
--
-- Doel: aantonen dat de bbox-RPC volstaat voor v1 (zie ADR 0004) en meten
-- wanneer we naar MVT-tiles moeten. Draai dit na een schemawijziging aan
-- reports of aan map_reports.
--
--   psql -d gc_test -f db/test/20_perf.sql

\timing off
\set ON_ERROR_STOP on

-- Eén technische gebruiker voor alle testmeldingen.
insert into auth.users (id) values ('99999999-9999-9999-9999-999999999999')
on conflict do nothing;

-- 50 000 meldingen, geclusterd rond 12 Vlaamse steden (realistischer dan
-- uniform: clustering is precies wat de kaartquery zwaar maakt).
insert into public.reports (client_ref, kind, size, geom, created_by, created_at, status)
select
  gen_random_uuid(),
  'litter',
  (array['piece','bag','heap'])[1 + (i % 3)]::public.litter_size,
  st_setsrid(st_makepoint(
    c.lng + (random() - 0.5) * 0.12,
    c.lat + (random() - 0.5) * 0.08
  ), 4326)::geography,
  '99999999-9999-9999-9999-999999999999',
  now() - (random() * interval '180 days'),
  'published'
from generate_series(1, 50000) i
cross join lateral (
  select lng, lat from (values
    (4.4025, 51.2194),  -- Antwerpen
    (3.7174, 51.0543),  -- Gent
    (4.3517, 50.8503),  -- Brussel
    (4.7005, 50.8798),  -- Leuven
    (5.3378, 50.9307),  -- Hasselt
    (3.2247, 51.2093),  -- Brugge
    (2.8277, 51.2093),  -- Oostende
    (4.8712, 51.3220),  -- Turnhout
    (5.4697, 50.9403),  -- Genk
    (3.3320, 50.8280),  -- Kortrijk
    (4.1415, 51.0259),  -- Sint-Niklaas
    (5.5797, 50.6326)   -- Luik
  ) as v(lng, lat)
  order by md5(i::text || v.lng::text)
  limit 1
) c;

analyze public.reports;

select count(*) as totaal_meldingen from public.reports;

\echo '--- zoom 16, straatniveau (Antwerpen-centrum) ---'
explain (analyze, buffers, timing)
select * from public.map_reports(4.39, 51.21, 4.42, 51.23, 16);

\echo '--- zoom 12, stadsniveau ---'
explain (analyze, buffers, timing)
select * from public.map_reports(4.30, 51.15, 4.50, 51.28, 12);

\echo '--- zoom 8, provincieniveau (zwaarste realistische query) ---'
explain (analyze, buffers, timing)
select * from public.map_reports(2.5, 50.6, 6.0, 51.5, 8);

\echo '--- nearby_reports ---'
explain (analyze, buffers, timing)
select * from public.nearby_reports(51.2194, 4.4025, 50);
