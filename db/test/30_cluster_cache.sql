-- 30_cluster_cache.sql — controleert dat de opschaalstap (db/scale/0100) exact
-- dezelfde aantallen geeft als de live query. Draai dit vóór je
-- use_cluster_cache in productie aanzet.
--
--   psql -d gc_test -f db/scale/0100_cluster_cache.sql
--   psql -d gc_test -f db/test/30_cluster_cache.sql

\set ON_ERROR_STOP on

select public.refresh_report_clusters();

create or replace function pg_temp.compare_zoom(p_zoom integer)
returns void language plpgsql as $$
declare
  v_live   bigint;
  v_cached bigint;
begin
  update public.app_config set value = 'false'::jsonb where key = 'use_cluster_cache';
  select coalesce(sum(point_count), 0) into v_live
  from public.map_reports(2.5, 50.4, 6.2, 51.6, p_zoom);

  update public.app_config set value = 'true'::jsonb where key = 'use_cluster_cache';
  select coalesce(sum(point_count), 0) into v_cached
  from public.map_reports(2.5, 50.4, 6.2, 51.6, p_zoom);

  if v_live <> v_cached then
    raise exception 'ASSERT FAILED: zoom % — live % vs cache %', p_zoom, v_live, v_cached;
  end if;
  raise notice 'ok — zoom %: cache en live tellen beide % meldingen', p_zoom, v_cached;
end;
$$;

select pg_temp.compare_zoom(z) from generate_series(5, 11) z;

-- Boven zoom 11 mag de cache niets veranderen (die paden zijn live).
select pg_temp.compare_zoom(12);
select pg_temp.compare_zoom(13);

update public.app_config set value = 'false'::jsonb where key = 'use_cluster_cache';
