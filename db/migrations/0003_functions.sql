-- 0003_functions.sql — de API. Elke write loopt hierlangs.
--
-- Conventie voor fouten: de exception-message is een **stabiele machinecode**
-- (bv. 'rate_limited'), niet een gebruikersboodschap. De client mapt die code
-- naar tekst, zodat vertalingen client-side blijven.
-- Zie docs/04-api-contract.md voor de volledige lijst.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.cfg(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.app_config where key = p_key;
$$;

create or replace function public.cfg_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((public.cfg(p_key))::integer, p_default);
$$;

-- IP-hash voor misbruikdetectie. We bewaren nooit een ruw IP-adres: enkel een
-- SHA-256 met een salt die maandelijks roteert (purge_old_data). Na een rotatie
-- is correlatie over de grens heen onmogelijk — precies de bedoeling, want de
-- auditrijen zijn dan toch al gewist (30 dagen bewaartermijn).
--
-- search_path bevat 'extensions' omdat pgcrypto daar op Supabase leeft; een
-- niet-bestaand schema in search_path wordt gewoon overgeslagen.
create or replace function public.hash_ip(p_ip text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_salt text;
begin
  if p_ip is null or btrim(p_ip) = '' then
    return null;
  end if;
  select value #>> '{}' into v_salt from public.app_config where key = 'ip_hash_salt';
  if v_salt is null then
    return null;
  end if;
  return encode(digest(btrim(p_ip) || v_salt, 'sha256'), 'hex');
end;
$$;

-- Leest het IP en de user agent uit de HTTP-headers die PostgREST doorgeeft.
-- Faalt stil: geen headers (bv. een directe SQL-aanroep of een test) mag nooit
-- een melding tegenhouden.
create or replace function public.request_meta()
returns jsonb
language plpgsql
stable
as $$
declare
  v_headers jsonb;
  v_ip      text;
  v_ua      text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;

  if v_headers is not null then
    -- x-forwarded-for kan een keten van proxy's zijn; de eerste is de client
    v_ip := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');
    v_ua := nullif(left(coalesce(v_headers ->> 'user-agent', ''), 200), '');
  end if;

  return jsonb_build_object('ip', v_ip, 'user_agent', v_ua);
end;
$$;

-- Punten per type/grootte. Eén plaats, zodat fase 2 enkel deze functie aanpast.
create or replace function public.points_for(
  p_kind public.report_kind,
  p_size public.litter_size
)
returns smallint
language sql
immutable
as $$
  select case
    when p_kind <> 'litter' then 3::smallint
    when p_size = 'piece'   then 1::smallint
    when p_size = 'bag'     then 5::smallint
    when p_size = 'heap'    then 15::smallint
    else 1::smallint
  end;
$$;

-- ---------------------------------------------------------------------------
-- create_report — de enige manier om een melding aan te maken
-- ---------------------------------------------------------------------------
-- Dwingt af, in deze volgorde:
--   1. authenticatie          → 'not_authenticated'
--   2. account niet geblokkeerd → 'account_blocked'
--   3. idempotentie op client_ref (retry van de outbox = zelfde melding)
--   4. geldige invoer          → 'invalid_coordinates' | 'invalid_kind' | 'size_required'
--   5. binnen servicegebied    → 'outside_service_area'
--   6. rate limits             → 'rate_limited'
--   7. eigen duplicaat dichtbij → geeft de bestaande melding terug
--
create or replace function public.create_report(
  p_client_ref  uuid,
  p_lat         double precision,
  p_lng         double precision,
  p_kind        public.report_kind    default 'litter',
  p_size        public.litter_size    default null,
  p_note        text                  default null,
  p_accuracy_m  numeric               default null,
  p_photo_path  text                  default null,
  p_client      public.client_platform default 'unknown',
  p_app_version text                  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_profile    public.profiles;
  v_point      geography(Point, 4326);
  v_existing   public.reports;
  v_report_id  uuid;
  v_photo_id   uuid;
  v_limit_hour integer := public.cfg_int('rate_limit_per_hour', 15);
  v_limit_day  integer := public.cfg_int('rate_limit_per_day', 40);
  v_dedupe_m   integer := public.cfg_int('dedupe_radius_m', 15);
  v_recent     integer;
  v_muni       text;
  v_nearby     integer;
  v_meta       jsonb;
begin
  -- 1. authenticatie
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'not_authenticated';
  end if;

  -- 2. blokkade
  if v_profile.trust_level = -1
     or (v_profile.blocked_until is not null and v_profile.blocked_until > now()) then
    raise exception 'account_blocked';
  end if;

  -- 3. idempotentie: de outbox mag onbeperkt opnieuw proberen
  select * into v_existing
  from public.reports
  where created_by = v_uid and client_ref = p_client_ref;

  if found then
    return jsonb_build_object(
      'report_id', v_existing.id,
      'status',    v_existing.status,
      'created_at', v_existing.created_at,
      'idempotent', true
    );
  end if;

  -- 4. invoer
  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_coordinates';
  end if;

  if not (public.cfg('enabled_kinds') ? p_kind::text) then
    raise exception 'invalid_kind';
  end if;

  if p_kind = 'litter' and p_size is null then
    raise exception 'size_required';
  end if;

  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  -- 5. servicegebied
  if coalesce((public.cfg('enforce_service_area'))::boolean, true) then
    if not exists (
      select 1 from public.service_areas
      where is_active and st_intersects(area, v_point)
    ) then
      raise exception 'outside_service_area';
    end if;
  end if;

  -- 6. rate limits (vertrouwde gebruikers krijgen het dubbele)
  if v_profile.trust_level >= 2 then
    v_limit_hour := v_limit_hour * 2;
    v_limit_day  := v_limit_day * 2;
  end if;

  select count(*) into v_recent
  from public.reports
  where created_by = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= v_limit_hour then
    raise exception 'rate_limited' using detail = 'hour';
  end if;

  select count(*) into v_recent
  from public.reports
  where created_by = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= v_limit_day then
    raise exception 'rate_limited' using detail = 'day';
  end if;

  -- 7. eigen duplicaat: geen fout, maar de bestaande melding teruggeven
  select * into v_existing
  from public.reports
  where created_by = v_uid
    and kind = p_kind
    and status in ('published', 'quarantined')
    and created_at > now() - interval '24 hours'
    and st_dwithin(geom, v_point, v_dedupe_m)
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'report_id',  v_existing.id,
      'status',     v_existing.status,
      'created_at', v_existing.created_at,
      'deduplicated', true
    );
  end if;

  -- gemeente bepalen (leeg als de grenzen niet geladen zijn)
  select code into v_muni
  from public.municipalities
  where st_intersects(area, v_point)
  limit 1;

  insert into public.reports (
    client_ref, kind, size, geom, accuracy_m, note,
    created_by, created_client, municipality_code, photo_count
  )
  values (
    p_client_ref, p_kind, p_size, v_point, p_accuracy_m,
    nullif(btrim(coalesce(p_note, '')), ''),
    v_uid, p_client, v_muni,
    case when p_photo_path is null then 0 else 1 end
  )
  returning id into v_report_id;

  if p_photo_path is not null then
    insert into public.report_photos (report_id, storage_path, bucket)
    values (v_report_id, p_photo_path, 'photo-inbox')
    returning id into v_photo_id;
  end if;

  v_meta := public.request_meta();

  insert into public.report_audit (report_id, ip_hash, user_agent, app_version)
  values (v_report_id,
          public.hash_ip(v_meta ->> 'ip'),
          v_meta ->> 'user_agent',
          p_app_version)
  on conflict (report_id) do nothing;

  update public.profiles
  set reports_count = reports_count + 1
  where id = v_uid;

  -- Informatief: hoeveel meldingen van anderen liggen hier al?
  select count(*) into v_nearby
  from public.reports
  where status = 'published'
    and id <> v_report_id
    and st_dwithin(geom, v_point, 30);

  return jsonb_build_object(
    'report_id',    v_report_id,
    'photo_id',     v_photo_id,
    'status',       'published',
    'created_at',   now(),
    'nearby_count', v_nearby
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- map_reports — de kaartquery
-- ---------------------------------------------------------------------------
-- Ingezoomd (zoom >= 14): losse meldingen, nieuwste eerst, max 600.
-- Uitgezoomd: server-side clustering door punten op een zoomafhankelijk
-- raster te snappen. Zie docs/06-kaart-en-performance.md
--
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
  v_zoom      integer  := greatest(1, least(coalesce(zoom, 12), 22));
  v_cell      double precision;
  v_statuses  public.report_status[];
  v_max_pts   integer := public.cfg_int('max_map_points', 600);
  v_max_clust integer := public.cfg_int('max_map_clusters', 800);
begin
  if min_lng is null or min_lat is null or max_lng is null or max_lat is null then
    raise exception 'invalid_bbox';
  end if;

  v_bbox := st_makeenvelope(
    least(min_lng, max_lng), least(min_lat, max_lat),
    greatest(min_lng, max_lng), greatest(min_lat, max_lat),
    4326
  );

  -- Rem op te grote vensters: dat is altijd een client-bug of een scraper.
  if st_area(v_bbox) > 100 then
    raise exception 'bbox_too_large';
  end if;

  v_statuses := case
    when include_cleaned then array['published', 'cleaned']::public.report_status[]
    else array['published']::public.report_status[]
  end;

  if v_zoom >= 14 then
    return query
      select
        false,
        st_x(r.geom::geometry),
        st_y(r.geom::geometry),
        1,
        r.id,
        r.kind,
        r.size,
        r.photo_count > 0,
        r.created_at
      from public.reports r
      where r.geom && v_bbox::geography
        and r.status = any (v_statuses)
        and (kinds is null or r.kind = any (kinds))
      order by r.created_at desc
      limit v_max_pts;
  else
    -- 4x4 cellen per tegel ≈ 48 markers in een telefoonviewport, op elke zoom.
    -- Zie docs/06-kaart-en-performance.md voor de doorrekening.
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
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- nearby_reports — vóór het posten: ligt hier al een melding?
-- ---------------------------------------------------------------------------
create or replace function public.nearby_reports(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m integer default 50
)
returns table (
  report_id  uuid,
  kind       public.report_kind,
  size       public.litter_size,
  distance_m double precision,
  created_at timestamptz,
  has_photo  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.kind,
    r.size,
    st_distance(r.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography),
    r.created_at,
    r.photo_count > 0
  from public.reports r
  where r.status = 'published'
    and st_dwithin(
      r.geom,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      least(greatest(coalesce(p_radius_m, 50), 5), 500)
    )
  order by 4 asc
  limit 20;
$$;

-- ---------------------------------------------------------------------------
-- report_details — één melding, met fotopad
-- ---------------------------------------------------------------------------
create or replace function public.report_details(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report public.reports;
  v_photos jsonb;
begin
  select * into v_report
  from public.reports
  where id = p_report_id
    and (status in ('published', 'cleaned') or created_by = auth.uid());

  if not found then
    raise exception 'report_not_found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'bucket',   p.bucket,
           'path',     p.storage_path,
           'width',    p.width,
           'height',   p.height,
           'blurhash', p.blurhash,
           'status',   p.scan_status
         ) order by p.created_at), '[]'::jsonb)
  into v_photos
  from public.report_photos p
  where p.report_id = v_report.id
    and (p.scan_status = 'safe' or v_report.created_by = auth.uid());

  return jsonb_build_object(
    'report_id',     v_report.id,
    'kind',          v_report.kind,
    'size',          v_report.size,
    'lat',           st_y(v_report.geom::geometry),
    'lng',           st_x(v_report.geom::geometry),
    'accuracy_m',    v_report.accuracy_m,
    'note',          v_report.note,
    'status',        v_report.status,
    'created_at',    v_report.created_at,
    'cleaned_at',    v_report.cleaned_at,
    'confirm_count', v_report.confirm_count,
    'is_mine',       v_report.created_by = auth.uid(),
    'photos',        v_photos
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- flag_report — rapporteren, met automatische quarantaine
-- ---------------------------------------------------------------------------
create or replace function public.flag_report(
  p_report_id uuid,
  p_reason    public.flag_reason,
  p_detail    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_threshold integer := public.cfg_int('auto_quarantine_flags', 3);
  v_count     integer;
  v_status    public.report_status;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.reports where id = p_report_id) then
    raise exception 'report_not_found';
  end if;

  insert into public.report_flags (report_id, flagged_by, reason, detail)
  values (p_report_id, v_uid, p_reason,
          nullif(btrim(coalesce(p_detail, '')), ''))
  on conflict (report_id, flagged_by) do update
    set reason = excluded.reason, detail = excluded.detail;

  select count(*) into v_count
  from public.report_flags where report_id = p_report_id;

  update public.reports
  set flag_count = v_count
  where id = p_report_id
  returning status into v_status;

  -- 'private_person' is een privacyklacht: die gaat meteen in quarantaine.
  if v_status = 'published'
     and (v_count >= v_threshold or p_reason = 'private_person') then
    update public.reports
    set status = 'quarantined', moderated_at = now()
    where id = p_report_id;

    insert into public.moderation_events (report_id, action, reason)
    values (p_report_id, 'auto_quarantine', p_reason::text);

    v_status := 'quarantined';
  end if;

  return jsonb_build_object('report_id', p_report_id,
                            'flag_count', v_count,
                            'status', v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_report — "ligt er nog", alternatief voor een duplicaat
-- ---------------------------------------------------------------------------
create or replace function public.confirm_report(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.report_confirmations (report_id, confirmed_by)
  values (p_report_id, v_uid)
  on conflict do nothing;

  select count(*) into v_count
  from public.report_confirmations where report_id = p_report_id;

  update public.reports
  set confirm_count = v_count
  where id = p_report_id and status = 'published';

  if not found then
    raise exception 'report_not_found';
  end if;

  return jsonb_build_object('report_id', p_report_id, 'confirm_count', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_cleaned — fase 2, staat uit via app_config.cleanups_enabled
-- ---------------------------------------------------------------------------
-- Fraudebeperking: je moet fysiek in de buurt staan (GPS), je kan een melding
-- niet binnen 5 minuten na je eigen melding opruimen, en punten worden
-- server-side berekend.
create or replace function public.mark_cleaned(
  p_report_id  uuid,
  p_lat        double precision,
  p_lng        double precision,
  p_photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_report   public.reports;
  v_point    geography(Point, 4326);
  v_distance double precision;
  v_points   smallint;
  v_photo_id uuid;
begin
  if not coalesce((public.cfg('cleanups_enabled'))::boolean, false) then
    raise exception 'feature_disabled';
  end if;

  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_report from public.reports
  where id = p_report_id and status = 'published'
  for update;

  if not found then
    raise exception 'report_not_found';
  end if;

  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_distance := st_distance(v_report.geom, v_point);

  if v_distance > 75 then
    raise exception 'too_far_away' using detail = round(v_distance)::text;
  end if;

  if v_report.created_by = v_uid
     and v_report.created_at > now() - interval '5 minutes' then
    raise exception 'own_report_cooldown';
  end if;

  v_points := public.points_for(v_report.kind, v_report.size);

  if p_photo_path is not null then
    insert into public.report_photos (report_id, storage_path, bucket)
    values (p_report_id, p_photo_path, 'photo-inbox')
    returning id into v_photo_id;
  end if;

  insert into public.cleanups (report_id, user_id, points_awarded, distance_m, photo_id)
  values (p_report_id, v_uid, v_points, v_distance, v_photo_id)
  on conflict (report_id, user_id) do nothing;

  if not found then
    raise exception 'already_cleaned';
  end if;

  update public.reports
  set status = 'cleaned', cleaned_at = now(), cleaned_by = v_uid
  where id = p_report_id;

  update public.profiles
  set points = points + v_points,
      cleanups_count = cleanups_count + 1
  where id = v_uid;

  return jsonb_build_object('report_id', p_report_id,
                            'points_awarded', v_points,
                            'distance_m', round(v_distance));
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_photo_scan — enkel voor de scan-photo Edge Function (service_role)
-- ---------------------------------------------------------------------------
create or replace function public.complete_photo_scan(
  p_photo_id uuid,
  p_status   public.photo_scan_status,
  p_bucket   text default null,
  p_labels   jsonb default null,
  p_width    integer default null,
  p_height   integer default null,
  p_bytes    integer default null,
  p_blurhash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
begin
  update public.report_photos
  set scan_status = p_status,
      bucket      = coalesce(p_bucket, bucket),
      scan_labels = coalesce(p_labels, scan_labels),
      width       = coalesce(p_width, width),
      height      = coalesce(p_height, height),
      bytes       = coalesce(p_bytes, bytes),
      blurhash    = coalesce(p_blurhash, blurhash),
      scanned_at  = now()
  where id = p_photo_id
  returning report_id into v_report_id;

  if v_report_id is null then
    raise exception 'photo_not_found';
  end if;

  if p_status = 'flagged' then
    update public.reports
    set status = 'quarantined', moderated_at = now()
    where id = v_report_id and status = 'published';

    insert into public.moderation_events (report_id, action, reason)
    values (v_report_id, 'auto_quarantine', 'photo_scan');
  end if;

  return jsonb_build_object('photo_id', p_photo_id, 'report_id', v_report_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderatie (beheerdersconsole, service_role of trust_level 3)
-- ---------------------------------------------------------------------------
create or replace function public.moderate_report(
  p_report_id uuid,
  p_action    text,          -- 'restore' | 'remove' | 'quarantine'
  p_reason    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_new       public.report_status;
  v_author    uuid;
begin
  if v_uid is not null and not public.is_moderator() then
    raise exception 'forbidden';
  end if;

  v_new := case p_action
    when 'restore'    then 'published'
    when 'remove'     then 'removed'
    when 'quarantine' then 'quarantined'
    else null
  end::public.report_status;

  if v_new is null then
    raise exception 'invalid_action';
  end if;

  update public.reports
  set status = v_new, moderated_at = now(), moderated_by = v_uid
  where id = p_report_id
  returning created_by into v_author;

  if v_author is null then
    raise exception 'report_not_found';
  end if;

  insert into public.moderation_events (report_id, actor_id, action, reason)
  values (p_report_id, v_uid, p_action, p_reason);

  return jsonb_build_object('report_id', p_report_id, 'status', v_new);
end;
$$;

create or replace function public.block_user(
  p_user_id uuid,
  p_days    integer default 30,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null and not public.is_moderator() then
    raise exception 'forbidden';
  end if;

  update public.profiles
  set blocked_until  = now() + make_interval(days => greatest(coalesce(p_days, 30), 1)),
      blocked_reason = p_reason,
      trust_level    = case when p_days >= 3650 then -1 else trust_level end
  where id = p_user_id;

  if not found then
    raise exception 'user_not_found';
  end if;

  insert into public.moderation_events (actor_id, action, reason)
  values (v_uid, 'block_user', coalesce(p_reason, '') || ' (' || p_user_id::text || ')');

  return jsonb_build_object('user_id', p_user_id, 'blocked_days', p_days);
end;
$$;

-- ---------------------------------------------------------------------------
-- Retentie — draait dagelijks (pg_cron, zie 0004)
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retention integer := public.cfg_int('retention_days', 365);
  v_audit     integer := public.cfg_int('audit_retention_days', 30);
  v_reports   integer;
  v_audits    integer;
  v_photos    integer;
  v_rotated   boolean := false;
begin
  -- Oude opgeruimde/verwijderde meldingen verdwijnen; open meldingen blijven.
  with gone as (
    delete from public.reports
    where status in ('cleaned', 'removed')
      and coalesce(cleaned_at, moderated_at, created_at) < now() - make_interval(days => v_retention)
    returning 1
  )
  select count(*) into v_reports from gone;

  with gone as (
    delete from public.report_audit
    where created_at < now() - make_interval(days => v_audit)
    returning 1
  )
  select count(*) into v_audits from gone;

  -- Foto's die na 24 u nog 'pending' zijn: scan is mislukt, niet publiceren.
  with stuck as (
    update public.report_photos
    set scan_status = 'failed'
    where scan_status = 'pending' and created_at < now() - interval '24 hours'
    returning 1
  )
  select count(*) into v_photos from stuck;

  -- Salt roteren zodra hij ouder is dan de auditbewaartermijn: op dat moment
  -- zijn alle rijen die met de oude salt gehasht zijn toch al gewist.
  if coalesce(
       (select (value #>> '{}')::timestamptz from public.app_config
        where key = 'ip_hash_salt_rotated_at'),
       'epoch'::timestamptz
     ) < now() - make_interval(days => v_audit) then
    insert into public.app_config (key, value) values
      ('ip_hash_salt', to_jsonb(gen_random_uuid()::text)),
      ('ip_hash_salt_rotated_at', to_jsonb(now()))
    on conflict (key) do update set value = excluded.value, updated_at = now();
    v_rotated := true;
  end if;

  return jsonb_build_object('reports_deleted', v_reports,
                            'audit_deleted', v_audits,
                            'photos_failed', v_photos,
                            'salt_rotated', v_rotated);
end;
$$;

-- ---------------------------------------------------------------------------
-- Uitvoerrechten: clients mogen enkel deze functies
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from anon, authenticated;

grant execute on function public.map_reports(double precision, double precision,
  double precision, double precision, integer, public.report_kind[], boolean)
  to anon, authenticated;
grant execute on function public.report_details(uuid) to anon, authenticated;
grant execute on function public.nearby_reports(double precision, double precision, integer)
  to anon, authenticated;

grant execute on function public.create_report(uuid, double precision, double precision,
  public.report_kind, public.litter_size, text, numeric, text,
  public.client_platform, text) to authenticated;
grant execute on function public.flag_report(uuid, public.flag_reason, text) to authenticated;
grant execute on function public.confirm_report(uuid) to authenticated;
grant execute on function public.mark_cleaned(uuid, double precision, double precision, text)
  to authenticated;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;
grant execute on function public.block_user(uuid, integer, text) to authenticated;

-- complete_photo_scan en purge_old_data: enkel service_role (default), niet gegrant.
