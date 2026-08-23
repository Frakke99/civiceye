-- dev_seed.sql — testdata voor lokale ontwikkeling en voor de staging-omgeving.
-- NOOIT op productie draaien.
--
--   psql -d <db> -f db/seed/dev_seed.sql
--
-- Maakt ~200 meldingen rond Antwerpen en de Kempen, verspreid over de laatste
-- 90 dagen, met een realistische mix van types, groottes, foto's en statussen —
-- zodat clustering, filters, quarantaine en de "opgeruimd"-weergave alle vier
-- zichtbaar zijn in de app.

do $$
declare
  v_seed_user uuid := '0d000000-0000-4000-8000-000000000001';
  v_other     uuid := '0d000000-0000-4000-8000-000000000002';
begin
  insert into auth.users (id, raw_app_meta_data)
  values (v_seed_user, '{"provider":"anonymous"}'),
         (v_other,     '{"provider":"anonymous"}')
  on conflict (id) do nothing;

  -- Rate limits mogen de seed niet tegenhouden.
  update public.profiles set trust_level = 2 where id in (v_seed_user, v_other);
end;
$$;

-- Wandelroutes: punten worden rond deze assen gestrooid, zodat het lijkt op
-- meldingen langs paden in plaats van willekeurige ruis.
with routes(name, lng, lat, spread) as (
  values
    ('Antwerpen Park Spoor Noord', 4.4179, 51.2320, 0.004),
    ('Antwerpen Linkeroever',      4.3835, 51.2210, 0.006),
    ('Rivierenhof Deurne',         4.4620, 51.2170, 0.005),
    ('Fort van Merksem',           4.4290, 51.2740, 0.004),
    ('Kalmthoutse Heide',          4.4300, 51.4000, 0.012),
    ('Turnhouts Vennengebied',     4.9200, 51.3600, 0.010),
    ('Zoerselbos',                 4.6900, 51.2600, 0.008),
    ('Netevallei Lier',            4.5700, 51.1300, 0.009)
),
generated as (
  select
    gen_random_uuid() as client_ref,
    r.name,
    -- 70 % papiertje, 22 % zak, 8 % afvalhoop: kleine dingen komen vaker voor
    case
      when random() < 0.70 then 'piece'
      when random() < 0.92 then 'bag'
      else 'heap'
    end::public.litter_size as size,
    r.lng + (random() - 0.5) * r.spread * 2 as lng,
    r.lat + (random() - 0.5) * r.spread     as lat,
    now() - (random() * interval '90 days') as created_at,
    random() as dice
  from routes r
  cross join generate_series(1, 25)
)
insert into public.reports (
  client_ref, kind, size, geom, accuracy_m, note, status,
  photo_count, created_by, created_client, created_at, cleaned_at, cleaned_by
)
select
  g.client_ref,
  'litter',
  g.size,
  st_setsrid(st_makepoint(g.lng, g.lat), 4326)::geography,
  round((3 + random() * 25)::numeric, 1),
  case
    when g.dice < 0.15 then 'Naast de vuilnisbak, ' || g.name
    when g.dice < 0.22 then 'Ligt er al een tijdje'
    when g.dice < 0.26 then 'Voorzichtig: glas'
    else null
  end,
  case
    when g.dice > 0.90 then 'cleaned'
    when g.dice > 0.87 then 'quarantined'
    else 'published'
  end::public.report_status,
  case when g.dice < 0.45 then 1 else 0 end,
  case when g.dice < 0.5
       then '0d000000-0000-4000-8000-000000000001'::uuid
       else '0d000000-0000-4000-8000-000000000002'::uuid end,
  case when g.dice < 0.4 then 'ios' when g.dice < 0.8 then 'android' else 'web' end::public.client_platform,
  g.created_at,
  case when g.dice > 0.90 then g.created_at + interval '2 days' else null end,
  case when g.dice > 0.90 then '0d000000-0000-4000-8000-000000000002'::uuid else null end
from generated g;

-- Bijhorende (fictieve) foto's, al op 'safe' zodat de app ze toont.
insert into public.report_photos (report_id, storage_path, bucket, scan_status,
                                  width, height, bytes, blurhash, scanned_at)
select
  r.id,
  'seed/' || r.id::text || '.jpg',
  'photo-public',
  'safe',
  1600, 1200, 240000,
  'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
  r.created_at
from public.reports r
where r.photo_count = 1
  and not exists (select 1 from public.report_photos p where p.report_id = r.id);

-- Eén cluster van dicht bij elkaar liggende meldingen: test de clusterweergave
-- en de "ligt hier al een melding?"-flow op straatniveau.
insert into public.reports (client_ref, kind, size, geom, created_by, created_client, created_at)
select
  gen_random_uuid(),
  'litter',
  'piece',
  st_setsrid(st_makepoint(4.40200 + i * 0.00012, 51.21900 + i * 0.00008), 4326)::geography,
  '0d000000-0000-4000-8000-000000000002',
  'android',
  now() - (i || ' hours')::interval
from generate_series(1, 12) i;

select
  count(*)                                              as meldingen,
  count(*) filter (where status = 'published')          as gepubliceerd,
  count(*) filter (where status = 'quarantined')        as quarantaine,
  count(*) filter (where status = 'cleaned')            as opgeruimd,
  count(*) filter (where photo_count > 0)               as met_foto
from public.reports;
