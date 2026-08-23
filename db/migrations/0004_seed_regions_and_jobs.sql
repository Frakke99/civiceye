-- 0004_seed_regions_and_jobs.sql — servicegebied piloot + geplande taken

-- ---------------------------------------------------------------------------
-- Servicegebied
-- ---------------------------------------------------------------------------
-- Ruwe bounding box rond België. Bewust grof: het doel is scope + spamfilter,
-- niet exacte grenscontrole. Vervang later door de echte grenspolygoon
-- (bv. uit Natural Earth of GADM) met dezelfde code 'BE'.
insert into public.service_areas (code, name, area, is_active)
values (
  'BE',
  'België (piloot)',
  st_multi(st_makeenvelope(2.45, 49.44, 6.45, 51.56, 4326))::geography,
  true
)
on conflict (code) do nothing;

insert into public.app_config (key, value)
values ('enforce_service_area', 'true'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Geplande taken (pg_cron)
-- ---------------------------------------------------------------------------
-- Op Supabase: activeer pg_cron één keer via Dashboard → Database → Extensions.
-- Lokaal ontbreekt de extensie meestal; daarom voorwaardelijk.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    -- Bestaande jobs met dezelfde naam eerst weg (idempotente migratie).
    perform cron.unschedule(jobid)
    from cron.job
    where jobname in ('purge-old-data', 'refresh-stats');

    perform cron.schedule('purge-old-data', '17 3 * * *',
                          $job$ select public.purge_old_data(); $job$);
  else
    raise notice 'pg_cron niet beschikbaar — purge_old_data() extern schedulen';
  end if;
end;
$$;
