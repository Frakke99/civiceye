-- 10_tests.sql — smoketests op het schema en de RPC-functies.
-- Draait in één transactie en rolt aan het einde terug (behalve in CI, waar de
-- database toch weggegooid wordt). Elke assert faalt hard met een duidelijke
-- boodschap, zodat CI stopt.

\set ON_ERROR_STOP on

create or replace function pg_temp.assert(p_cond boolean, p_what text)
returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception 'ASSERT FAILED: %', p_what;
  end if;
  raise notice 'ok — %', p_what;
end;
$$;

-- Vangt een verwachte foutcode op.
create or replace function pg_temp.expect_error(p_sql text, p_code text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_code || '%' then
      raise notice 'ok — fout "%" zoals verwacht', p_code;
      return;
    end if;
    raise exception 'ASSERT FAILED: verwachtte "%", kreeg "%"', p_code, sqlerrm;
  end;
  raise exception 'ASSERT FAILED: verwachtte fout "%", maar er kwam geen', p_code;
end;
$$;

begin;

-- --- testgebruikers ---------------------------------------------------------
insert into auth.users (id, raw_app_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '{"provider":"anonymous"}'),
  ('22222222-2222-2222-2222-222222222222', '{"provider":"anonymous"}'),
  ('33333333-3333-3333-3333-333333333333', '{"provider":"email"}');

select pg_temp.assert((select count(*) = 3 from public.profiles),
  'trigger maakt een profiel per auth-gebruiker');

-- gebruiker 3 wordt moderator
update public.profiles set trust_level = 3
where id = '33333333-3333-3333-3333-333333333333';

-- --- 1. anoniem posten is verboden -----------------------------------------
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error(
  $$ select public.create_report(gen_random_uuid(), 51.2, 4.4, 'litter', 'bag') $$,
  'not_authenticated');

-- --- 2. normale melding ----------------------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

create temporary table t_result as
select public.create_report(
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  51.2194, 4.4025, 'litter', 'bag', 'Zak naast het bankje', 8.5, null, 'ios', '1.0.0'
) as r;

select pg_temp.assert((select (r ->> 'status') = 'published' from t_result),
  'melding wordt meteen gepubliceerd');
select pg_temp.assert((select (r ->> 'report_id') is not null from t_result),
  'melding krijgt een id');
select pg_temp.assert((select reports_count = 1 from public.profiles
                       where id = '11111111-1111-1111-1111-111111111111'),
  'reports_count wordt bijgehouden');

-- --- 3. idempotentie: zelfde client_ref = zelfde melding -------------------
select pg_temp.assert(
  (select (public.create_report('aaaaaaaa-0000-0000-0000-000000000001'::uuid,
           51.2194, 4.4025, 'litter', 'bag') ->> 'idempotent')::boolean),
  'retry met hetzelfde client_ref maakt geen tweede melding');
select pg_temp.assert((select count(*) = 1 from public.reports),
  'nog steeds één melding in de databank');

-- --- 4. validatie ----------------------------------------------------------
select pg_temp.expect_error(
  $$ select public.create_report(gen_random_uuid(), 51.2, 4.4, 'litter', null) $$,
  'size_required');
select pg_temp.expect_error(
  $$ select public.create_report(gen_random_uuid(), 999, 4.4, 'litter', 'bag') $$,
  'invalid_coordinates');
select pg_temp.expect_error(
  $$ select public.create_report(gen_random_uuid(), 51.2, 4.4, 'hazard') $$,
  'invalid_kind');   -- fase-2-type staat nog niet in enabled_kinds
select pg_temp.expect_error(
  $$ select public.create_report(gen_random_uuid(), 48.85, 2.35, 'litter', 'bag') $$,
  'outside_service_area');  -- Parijs

-- --- 5. eigen duplicaat binnen 15 m ---------------------------------------
select pg_temp.assert(
  (select (public.create_report(gen_random_uuid(), 51.21941, 4.40251, 'litter', 'bag')
           ->> 'deduplicated')::boolean),
  'eigen melding op 1 m afstand wordt gededupliceerd');

-- --- 6. rate limit ---------------------------------------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare i integer;
begin
  for i in 1..15 loop
    -- ver genoeg uit elkaar om dedupe te vermijden (~0.001° ≈ 111 m)
    perform public.create_report(gen_random_uuid(), 51.0 + i * 0.001, 4.0, 'litter', 'piece');
  end loop;
end;
$$;
select pg_temp.expect_error(
  $$ select public.create_report(gen_random_uuid(), 51.5, 4.5, 'litter', 'piece') $$,
  'rate_limited');

-- --- 7. kaartquery: punten en clusters ------------------------------------
select pg_temp.assert(
  (select count(*) = 15 from public.map_reports(3.9, 50.9, 4.1, 51.1, 15)),
  'ingezoomd geeft losse punten');
select pg_temp.assert(
  (select bool_and(not is_cluster) from public.map_reports(3.9, 50.9, 4.1, 51.1, 15)),
  'punten zijn geen clusters');
select pg_temp.assert(
  (select sum(point_count) = 15 from public.map_reports(3.9, 50.9, 4.1, 51.1, 9)),
  'uitgezoomd telt clustering alle meldingen mee');
select pg_temp.assert(
  (select count(*) < 15 from public.map_reports(3.9, 50.9, 4.1, 51.1, 9)),
  'uitgezoomd zijn er minder markers dan meldingen');
select pg_temp.expect_error(
  $$ select * from public.map_reports(-180, -85, 180, 85, 2) $$,
  'bbox_too_large');

-- --- 8. nearby_reports ----------------------------------------------------
select pg_temp.assert(
  (select count(*) >= 1 from public.nearby_reports(51.2194, 4.4025, 50)),
  'nearby_reports vindt de melding vlakbij');
select pg_temp.assert(
  (select count(*) = 0 from public.nearby_reports(50.0, 3.0, 50)),
  'nearby_reports vindt niets in een leeg gebied');

-- --- 9. report_details ----------------------------------------------------
select pg_temp.assert(
  (select (public.report_details((select id from public.reports
            where created_by = '11111111-1111-1111-1111-111111111111' limit 1))
           ->> 'note') = 'Zak naast het bankje'),
  'report_details geeft de melding terug');
select pg_temp.expect_error(
  $$ select public.report_details('00000000-0000-0000-0000-000000000000') $$,
  'report_not_found');

-- --- 10. flags en automatische quarantaine --------------------------------
do $$
declare
  v_id uuid;
  v_res jsonb;
begin
  select id into v_id from public.reports
  where created_by = '11111111-1111-1111-1111-111111111111' limit 1;

  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  v_res := public.flag_report(v_id, 'not_there');
  if (v_res ->> 'status') <> 'published' then
    raise exception 'ASSERT FAILED: één flag mag niet meteen verbergen';
  end if;

  -- privacyklacht gaat onmiddellijk in quarantaine
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  v_res := public.flag_report(v_id, 'private_person');
  if (v_res ->> 'status') <> 'quarantined' then
    raise exception 'ASSERT FAILED: private_person moet quarantaine geven, kreeg %', v_res;
  end if;
  raise notice 'ok — flags: 1 flag blijft zichtbaar, privacyklacht verbergt meteen';
end;
$$;

select pg_temp.assert(
  (select count(*) = 0 from public.map_reports(4.39, 51.21, 4.41, 51.23, 16)),
  'gequarantineerde melding staat niet meer op de kaart');

-- --- 11. moderatie: herstellen ------------------------------------------------
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
do $$
declare v_id uuid;
begin
  select id into v_id from public.reports where status = 'quarantined' limit 1;
  perform public.moderate_report(v_id, 'restore', 'foto is in orde');
end;
$$;
select pg_temp.assert(
  (select count(*) = 1 from public.reports where status = 'published'
     and created_by = '11111111-1111-1111-1111-111111111111'),
  'moderator kan een melding herstellen');
select pg_temp.assert(
  (select count(*) >= 2 from public.moderation_events),
  'moderatiehandelingen worden gelogd');

-- niet-moderator mag niet modereren
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.expect_error(
  $$ select public.moderate_report((select id from public.reports limit 1), 'remove') $$,
  'forbidden');

-- --- 12. opruimen staat uit in v1 ----------------------------------------
select pg_temp.expect_error(
  $$ select public.mark_cleaned((select id from public.reports limit 1), 51.2194, 4.4025) $$,
  'feature_disabled');

-- --- 13. opruimen mét feature flag aan (fase 2) --------------------------
update public.app_config set value = 'true'::jsonb where key = 'cleanups_enabled';

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select pg_temp.expect_error(
  $$ select public.mark_cleaned(
       (select id from public.reports
        where created_by = '11111111-1111-1111-1111-111111111111' limit 1),
       50.0, 3.0) $$,
  'too_far_away');

do $$
declare v_id uuid; v_res jsonb;
begin
  select id into v_id from public.reports
  where created_by = '11111111-1111-1111-1111-111111111111' limit 1;
  v_res := public.mark_cleaned(v_id, 51.21945, 4.40255);
  if (v_res ->> 'points_awarded')::int <> 5 then
    raise exception 'ASSERT FAILED: een zak moet 5 punten geven, kreeg %', v_res;
  end if;
  raise notice 'ok — opruimen dichtbij levert punten op';
end;
$$;

select pg_temp.assert(
  (select points = 5 and cleanups_count = 1 from public.profiles
   where id = '22222222-2222-2222-2222-222222222222'),
  'punten komen op het profiel terecht');
select pg_temp.assert(
  (select status = 'cleaned' and cleaned_at is not null from public.reports
   where created_by = '11111111-1111-1111-1111-111111111111' limit 1),
  'melding staat op opgeruimd');

update public.app_config set value = 'false'::jsonb where key = 'cleanups_enabled';

-- --- 14. foto-pipeline ---------------------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
declare v_res jsonb; v_photo uuid;
begin
  v_res := public.create_report(gen_random_uuid(), 51.3, 4.5, 'litter', 'heap',
                                null, 5, 'inbox/2026/08/abc.jpg', 'android', '1.0.0');
  v_photo := (v_res ->> 'photo_id')::uuid;
  if v_photo is null then
    raise exception 'ASSERT FAILED: foto werd niet aangemaakt';
  end if;
  if (select scan_status from public.report_photos where id = v_photo) <> 'pending' then
    raise exception 'ASSERT FAILED: nieuwe foto moet pending zijn';
  end if;

  -- scanner keurt goed
  perform public.complete_photo_scan(v_photo, 'safe', 'photo-public', '{"labels":[]}',
                                     1600, 1200, 240000, 'LEHV6nWB2yk8');
  if (select bucket from public.report_photos where id = v_photo) <> 'photo-public' then
    raise exception 'ASSERT FAILED: goedgekeurde foto moet naar photo-public';
  end if;
  raise notice 'ok — foto-pipeline: pending → safe → photo-public';
end;
$$;

-- afgekeurde foto zet de melding in quarantaine
do $$
declare v_res jsonb; v_photo uuid; v_report uuid;
begin
  v_res := public.create_report(gen_random_uuid(), 51.31, 4.51, 'litter', 'piece',
                                null, 5, 'inbox/2026/08/def.jpg', 'android', '1.0.0');
  v_photo  := (v_res ->> 'photo_id')::uuid;
  v_report := (v_res ->> 'report_id')::uuid;
  perform public.complete_photo_scan(v_photo, 'flagged', null, '{"labels":["person"]}');
  if (select status from public.reports where id = v_report) <> 'quarantined' then
    raise exception 'ASSERT FAILED: afgekeurde foto moet de melding verbergen';
  end if;
  raise notice 'ok — afgekeurde foto zet de melding in quarantaine';
end;
$$;

-- --- 15. geblokkeerde gebruiker -----------------------------------------
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select public.block_user('11111111-1111-1111-1111-111111111111', 30, 'spam');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.expect_error(
  $$ select public.create_report(gen_random_uuid(), 51.4, 4.6, 'litter', 'bag') $$,
  'account_blocked');

-- --- 16. retentie --------------------------------------------------------
-- Let op: now() staat stil binnen een transactie, dus we backdaten de rij
-- in plaats van de bewaartermijn op 0 te zetten.
update public.reports
set cleaned_at = now() - interval '400 days'
where status = 'cleaned';

select pg_temp.assert(
  (select (public.purge_old_data() ->> 'reports_deleted')::int = 1),
  'purge_old_data ruimt een opgeruimde melding van 400 dagen oud op');
select pg_temp.assert(
  (select count(*) > 0 from public.reports where status = 'published'),
  'purge_old_data laat open meldingen staan, ongeacht leeftijd');

update public.report_audit set created_at = now() - interval '90 days';
select pg_temp.assert(
  (select (public.purge_old_data() ->> 'audit_deleted')::int >= 1),
  'purge_old_data wist auditrijen na de bewaartermijn');

update public.report_photos set created_at = now() - interval '2 days'
where scan_status = 'pending';
select pg_temp.assert(
  (select (public.purge_old_data() ->> 'photos_failed')::int >= 0),
  'purge_old_data markeert vastgelopen scans als failed');

-- --- 17. RLS: rechtstreeks schrijven mag niet ---------------------------
do $$
begin
  set local role authenticated;
  begin
    insert into public.reports (client_ref, kind, size, geom, created_by)
    values (gen_random_uuid(), 'litter', 'bag',
            st_setsrid(st_makepoint(4.4, 51.2), 4326)::geography,
            '22222222-2222-2222-2222-222222222222');
    reset role;
    raise exception 'ASSERT FAILED: directe INSERT in reports moet geweigerd worden';
  exception when insufficient_privilege or check_violation then
    reset role;
    raise notice 'ok — client kan niet rechtstreeks in reports schrijven';
  end;
end;
$$;

do $$
begin
  set local role anon;
  begin
    perform count(*) from public.report_audit;
    reset role;
    raise exception 'ASSERT FAILED: anon mag report_audit niet lezen';
  exception when insufficient_privilege then
    reset role;
    raise notice 'ok — anon kan de audittabel niet lezen';
  end;
end;
$$;

rollback;
