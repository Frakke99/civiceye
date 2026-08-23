-- 0100_cluster_cache.sql — OPSCHAALSTAP, niet nodig bij de eerste roll-out.
--
-- Wanneer toepassen? Zodra p95 van map_reports boven ~400 ms gaat, of vanaf
-- ruwweg 100 000 actieve meldingen.
--
-- Gemeten met db/test/20_perf.sql (Postgres 16 + PostGIS 3.4, 1 vCPU-klasse,
-- geclusterde testdata rond 12 Vlaamse steden):
--
--   meldingen | zoom 16 | zoom 12 | zoom 8 live | zoom 8 cache | zoom 5 cache
--   ----------|---------|---------|-------------|--------------|-------------
--      50 000 |  3 ms   |  10 ms  |    104 ms   |      —       |      —
--     500 000 |  2 ms   |  25 ms  |    712 ms   |    2,4 ms    |   0,5 ms
--
-- Bij 500 000 meldingen bevat de clusterlaag 8 052 rijen en duurt een
-- REFRESH ... CONCURRENTLY ongeveer 8 s — ruim binnen een interval van
-- 5 minuten, en zonder de kaart te blokkeren.
--
-- db/test/30_cluster_cache.sql bewijst dat cache en live query op elk
-- zoomniveau exact hetzelfde aantal meldingen tellen.
-- Ingezoomd (zoom >= 12) blijft de query live: daar is hij snel én moet een
-- nieuwe melding onmiddellijk zichtbaar zijn. Enkel de uitgezoomde clusterlaag
-- komt uit de cache en mag tot 5 minuten oud zijn.

-- ---------------------------------------------------------------------------
-- 1. Geaggregeerde clusterlaag
-- ---------------------------------------------------------------------------
create materialized view if not exists public.report_clusters as
select
  z.zoom,
  st_snaptogrid(r.geom::geometry, 360.0 / (2 ^ (z.zoom + 2)))        as cell,
  r.kind,
  r.size,
  (r.status = 'cleaned')                                            as is_cleaned,
  count(*)::integer                                                 as point_count,
  sum(st_x(r.geom::geometry))                                       as sum_lng,
  sum(st_y(r.geom::geometry))                                       as sum_lat,
  bool_or(r.photo_count > 0)                                        as with_photo,
  max(r.created_at)                                                 as last_created_at
from public.reports r
cross join generate_series(5, 11) as z(zoom)
where r.status in ('published', 'cleaned')
group by z.zoom, 2, r.kind, r.size, 5;

-- Unieke index is vereist voor REFRESH ... CONCURRENTLY (geen leestijd-lock).
create unique index if not exists report_clusters_key
  on public.report_clusters (zoom, cell, kind, size, is_cleaned);
create index if not exists report_clusters_cell_gix
  on public.report_clusters using gist (cell);

-- De matview erft geen RLS; clients lezen hem nooit rechtstreeks (enkel via
-- map_reports, dat security definer is).
revoke all on public.report_clusters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. map_reports leest de cache voor uitgezoomde niveaus
-- ---------------------------------------------------------------------------
create or replace function public.map_reports(
  min_lng          double precision,
  min_lat          double precision,
  max_lng          double precision,
  max_lat          double precision,
  zoom             integer,
  kinds            public.report_kind[] default null,
  include_cleaned  boolean default false
)
returns table (
  is_cluster  boolean,
  lng         double precision,
  lat         double precision,
  point_count integer,
  report_id   uuid,
  kind        public.report_kind,
  size        public.litter_size,
  has_photo   boolean,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_bbox      geometry;
  v_zoom      integer := greatest(1, least(coalesce(zoom, 12), 22));
  v_cell      double precision;
  v_statuses  public.report_status[];
  v_max_pts   integer := public.cfg_int('max_map_points', 600);
  v_max_clust integer := public.cfg_int('max_map_clusters', 800);
  v_use_cache boolean := coalesce((public.cfg('use_cluster_cache'))::boolean, false);
begin
  if min_lng is null or min_lat is null or max_lng is null or max_lat is null then
    raise exception 'invalid_bbox';
  end if;

  v_bbox := st_makeenvelope(
    least(min_lng, max_lng), least(min_lat, max_lat),
    greatest(min_lng, max_lng), greatest(min_lat, max_lat),
    4326
  );

  if st_area(v_bbox) > 100 then
    raise exception 'bbox_too_large';
  end if;

  v_statuses := case
    when include_cleaned then array['published', 'cleaned']::public.report_status[]
    else array['published']::public.report_status[]
  end;

  -- a) ingezoomd: losse, actuele meldingen
  if v_zoom >= 14 then
    return query
      select false, st_x(r.geom::geometry), st_y(r.geom::geometry), 1,
             r.id, r.kind, r.size, r.photo_count > 0, r.created_at
      from public.reports r
      where r.geom && v_bbox::geography
        and r.status = any (v_statuses)
        and (kinds is null or r.kind = any (kinds))
      order by r.created_at desc
      limit v_max_pts;
    return;
  end if;

  -- b) uitgezoomd mét cache
  if v_use_cache and v_zoom between 5 and 11 then
    -- Cellen worden gesnapt op hun linkeronderhoek: een cel die het venster
    -- overlapt kan een hoek buiten het venster hebben. We zoeken daarom één
    -- celbreedte ruimer, anders vallen clusters aan de rand weg bij het pannen.
    v_cell := 360.0 / (2 ^ (v_zoom + 2));

    return query
      select
        true,
        (sum(c.sum_lng) / sum(c.point_count))::double precision,
        (sum(c.sum_lat) / sum(c.point_count))::double precision,
        sum(c.point_count)::integer,
        null::uuid,
        (array_agg(c.kind order by c.point_count desc))[1],
        (array_agg(c.size order by c.point_count desc))[1],
        bool_or(c.with_photo),
        max(c.last_created_at)
      from public.report_clusters c
      where c.zoom = v_zoom
        and c.cell && st_expand(v_bbox, v_cell)
        and (include_cleaned or not c.is_cleaned)
        and (kinds is null or c.kind = any (kinds))
      group by c.cell
      order by sum(c.point_count) desc
      limit v_max_clust;
    return;
  end if;

  -- c) uitgezoomd zonder cache (v1-gedrag)
  v_cell := 360.0 / (2 ^ (v_zoom + 2));

  return query
    select
      true,
      avg(st_x(r.geom::geometry))::double precision,
      avg(st_y(r.geom::geometry))::double precision,
      count(*)::integer,
      null::uuid,
      mode() within group (order by r.kind),
      mode() within group (order by r.size),
      bool_or(r.photo_count > 0),
      max(r.created_at)
    from public.reports r
    where r.geom && v_bbox::geography
      and r.status = any (v_statuses)
      and (kinds is null or r.kind = any (kinds))
    group by st_snaptogrid(r.geom::geometry, v_cell)
    order by count(*) desc
    limit v_max_clust;
end;
$$;

grant execute on function public.map_reports(double precision, double precision,
  double precision, double precision, integer, public.report_kind[], boolean)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Verversen elke 5 minuten
-- ---------------------------------------------------------------------------
create or replace function public.refresh_report_clusters()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.report_clusters;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'refresh-clusters';
    perform cron.schedule('refresh-clusters', '*/5 * * * *',
                          $job$ select public.refresh_report_clusters(); $job$);
  else
    raise notice 'pg_cron niet beschikbaar — refresh_report_clusters() extern schedulen';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Aanzetten (pas ná een refresh, anders is de kaart even leeg)
-- ---------------------------------------------------------------------------
insert into public.app_config (key, value)
values ('use_cluster_cache', 'false'::jsonb)
on conflict (key) do nothing;

-- Handmatig, na controle:
--   select public.refresh_report_clusters();
--   update public.app_config set value = 'true' where key = 'use_cluster_cache';
-- Terugdraaien is één UPDATE naar 'false' — de live query blijft altijd werken.
