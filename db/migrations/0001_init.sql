-- 0001_init.sql — basisschema
-- Doelplatform: Supabase (Postgres 15+) met PostGIS.
-- Lokaal testen: zie db/test/README.md (stubt het auth-schema van Supabase).

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Alle meldingstypes zitten er van dag 1 in; de v1-UI toont enkel 'litter'.
-- Zo hoeven fase-2-types geen enum-migratie op een tabel met miljoenen rijen.
create type public.report_kind as enum (
  'litter',            -- zwerfafval
  'hazard',            -- gevaarlijk terrein
  'dead_animal',       -- dood dier
  'fallen_tree',       -- omgevallen boom / geblokkeerd pad
  'damaged_furniture', -- kapot bankje, vuilnisbak, bord
  'other'
);

-- Grootte, enkel relevant voor 'litter'. De drie symbolen uit de UI.
create type public.litter_size as enum (
  'piece',  -- papiertje / los stuk
  'bag',    -- volle zak
  'heap'    -- afvalhoop / sluikstort
);

create type public.report_status as enum (
  'published',     -- zichtbaar op de kaart
  'quarantined',   -- verborgen, wacht op moderatie
  'cleaned',       -- opgeruimd (fase 2), blijft 30 dagen zichtbaar als 'opgeruimd'
  'removed'        -- door moderator verwijderd, blijft bewaard voor audit
);

create type public.client_platform as enum ('ios', 'android', 'web', 'unknown');

create type public.photo_scan_status as enum ('pending', 'safe', 'flagged', 'failed');

create type public.flag_reason as enum (
  'not_there',      -- afval ligt er niet (meer)
  'wrong_location', -- pin staat verkeerd
  'inappropriate',  -- ongepaste foto/tekst
  'spam',
  'private_person', -- herkenbare persoon of nummerplaat op de foto
  'other'
);

-- ---------------------------------------------------------------------------
-- Profielen
-- ---------------------------------------------------------------------------
-- Eén rij per auth-gebruiker, ook voor anonieme gebruikers. Publiek nooit
-- zichtbaar in v1: de kaart toont geen enkele melder. Bestaat om (a) misbruik
-- te kunnen stoppen en (b) fase 2 (punten) mogelijk te maken zonder migratie.

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (display_name is null or char_length(display_name) between 2 and 32),
  is_anonymous  boolean     not null default true,
  points        integer     not null default 0 check (points >= 0),
  reports_count integer     not null default 0,
  cleanups_count integer    not null default 0,
  trust_level   smallint    not null default 0 check (trust_level between -1 and 3),
    -- -1 = geblokkeerd, 0 = nieuw, 1 = bevestigd, 2 = vertrouwd, 3 = moderator
  blocked_until timestamptz,
  blocked_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.profiles.trust_level is
  'Bepaalt rate limits en of moderatie vooraf of achteraf gebeurt. Zie docs/adr/0008-moderatie-model.md';

-- Automatisch een profiel bij elke nieuwe (ook anonieme) auth-gebruiker.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, is_anonymous)
  values (new.id, coalesce((new.raw_app_meta_data ->> 'provider') = 'anonymous', true))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Servicegebied
-- ---------------------------------------------------------------------------
-- Meldingen buiten een actief servicegebied worden geweigerd. Dat houdt de
-- piloot beheersbaar en blokkeert de meest voorkomende spam (willekeurige
-- coördinaten ergens op de oceaan). Uitbreiden = één INSERT.

create table public.service_areas (
  code       text primary key,
  name       text not null,
  area       geography(MultiPolygon, 4326) not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index service_areas_area_gix on public.service_areas using gist (area)
  where is_active;

-- Optioneel: gemeentegrenzen om meldingen automatisch aan een gemeente te
-- hangen (voor export naar gemeenten). Leeg laten mag: dan blijft
-- reports.municipality_code null.
create table public.municipalities (
  code       text primary key,   -- NIS-code
  name       text not null,
  area       geography(MultiPolygon, 4326) not null
);

create index municipalities_area_gix on public.municipalities using gist (area);

-- ---------------------------------------------------------------------------
-- Meldingen
-- ---------------------------------------------------------------------------

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  -- Client-gegenereerde id: maakt posten idempotent bij netwerkretries
  -- (offline outbox). Zie docs/adr/0006-offline-outbox.md
  client_ref       uuid not null,
  kind             public.report_kind   not null default 'litter',
  size             public.litter_size,
  geom             geography(Point, 4326) not null,
  accuracy_m       numeric(7,1) check (accuracy_m is null or accuracy_m >= 0),
  note             text check (note is null or char_length(note) <= 280),
  status           public.report_status not null default 'published',
  photo_count      smallint not null default 0 check (photo_count between 0 and 3),
  flag_count       smallint not null default 0,
  confirm_count    smallint not null default 0,
  municipality_code text references public.municipalities (code),
  created_by       uuid not null references public.profiles (id) on delete cascade,
  created_client   public.client_platform not null default 'unknown',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  cleaned_at       timestamptz,
  cleaned_by       uuid references public.profiles (id) on delete set null,
  moderated_at     timestamptz,
  moderated_by     uuid references public.profiles (id) on delete set null,

  constraint litter_requires_size
    check (kind <> 'litter' or size is not null),
  constraint size_only_for_litter
    check (kind = 'litter' or size is null),
  constraint cleaned_has_timestamp
    check ((status = 'cleaned') = (cleaned_at is not null)),
  constraint client_ref_unique_per_user unique (created_by, client_ref)
);

-- De kaartquery: bbox-filter op status. Partieel, want 'removed' halen we nooit op.
create index reports_geom_gix on public.reports using gist (geom)
  where status in ('published', 'cleaned');

-- Lijst-/exportquery's en de retentiejob filteren altijd op status of melder;
-- een losse index op created_at zou niets extra's dienen.
create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_created_by_idx on public.reports (created_by, created_at desc);
create index reports_municipality_idx on public.reports (municipality_code, created_at desc)
  where municipality_code is not null;

-- ---------------------------------------------------------------------------
-- Foto's
-- ---------------------------------------------------------------------------
-- Foto's leven in twee buckets: 'photo-inbox' (privé, enkel schrijven via
-- signed URL) en 'photo-public' (CDN). scan-photo verplaatst na de scan.
-- Zie docs/adr/0005-foto-pipeline.md

create table public.report_photos (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports (id) on delete cascade,
  storage_path text not null unique,   -- pad binnen de huidige bucket
  bucket       text not null default 'photo-inbox',
  scan_status  public.photo_scan_status not null default 'pending',
  scan_labels  jsonb,                  -- ruwe uitvoer van de classifier, voor audit
  scanned_at   timestamptz,
  width        integer check (width is null or width > 0),
  height       integer check (height is null or height > 0),
  bytes        integer check (bytes is null or bytes > 0),
  blurhash     text,                   -- placeholder tijdens laden/scannen
  created_at   timestamptz not null default now()
);

create index report_photos_report_idx on public.report_photos (report_id);
create index report_photos_pending_idx on public.report_photos (created_at)
  where scan_status = 'pending';

-- ---------------------------------------------------------------------------
-- Rapporteren (flags) en bevestigen
-- ---------------------------------------------------------------------------

create table public.report_flags (
  report_id  uuid not null references public.reports (id) on delete cascade,
  flagged_by uuid not null references public.profiles (id) on delete cascade,
  reason     public.flag_reason not null,
  detail     text check (detail is null or char_length(detail) <= 280),
  created_at timestamptz not null default now(),
  primary key (report_id, flagged_by)
);

create index report_flags_created_idx on public.report_flags (created_at desc);

-- "Ligt er nog" — laat gebruikers een oude melding bevestigen zonder te dupliceren.
create table public.report_confirmations (
  report_id    uuid not null references public.reports (id) on delete cascade,
  confirmed_by uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (report_id, confirmed_by)
);

-- ---------------------------------------------------------------------------
-- Opruimacties (fase 2 — schema staat klaar, UI komt later)
-- ---------------------------------------------------------------------------

create table public.cleanups (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.reports (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  points_awarded smallint not null default 0 check (points_awarded >= 0),
  distance_m     numeric(8,1),          -- afstand gebruiker↔melding bij melden
  photo_id       uuid references public.report_photos (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (report_id, user_id)
);

create index cleanups_user_idx on public.cleanups (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit & misbruikdetectie (nooit publiek leesbaar)
-- ---------------------------------------------------------------------------
-- IP wordt enkel als hash bewaard, met roterend salt, 30 dagen. Genoeg om
-- misbruik te correleren, niet genoeg om iemand te identificeren.

create table public.report_audit (
  report_id  uuid primary key references public.reports (id) on delete cascade,
  ip_hash    text,
  user_agent text,
  app_version text,
  created_at timestamptz not null default now()
);

create index report_audit_ip_idx on public.report_audit (ip_hash, created_at desc);
create index report_audit_created_idx on public.report_audit (created_at);

-- Moderatiehandelingen: wie deed wat wanneer.
create table public.moderation_events (
  id             bigint generated always as identity primary key,
  report_id      uuid references public.reports (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  actor_id       uuid references public.profiles (id) on delete set null,
  action         text not null check (action in
                   ('quarantine', 'restore', 'remove', 'block_user', 'auto_quarantine')),
  reason         text,
  created_at     timestamptz not null default now()
);

create index moderation_events_report_idx on public.moderation_events (report_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Configuratie (runtime feature flags en limieten, zonder deploy aanpasbaar)
-- ---------------------------------------------------------------------------

create table public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value) values
  ('rate_limit_per_hour',      '15'::jsonb),
  ('rate_limit_per_day',       '40'::jsonb),
  ('dedupe_radius_m',          '15'::jsonb),
  ('auto_quarantine_flags',    '3'::jsonb),
  ('max_map_points',           '600'::jsonb),
  ('max_map_clusters',         '800'::jsonb),
  ('retention_days',           '365'::jsonb),
  ('audit_retention_days',     '30'::jsonb),
  ('cleanups_enabled',         'false'::jsonb),
  ('enabled_kinds',            '["litter"]'::jsonb),
  ('min_supported_app_version', '"1.0.0"'::jsonb);

-- Geheimen die de databank zelf beheert (nu enkel de IP-hash-salt).
-- Bewust een aparte tabel: app_config is leesbaar voor clients, deze tabel
-- voor niemand — RLS aan (0002), geen policies, geen grants. Met de salt in
-- handen zou een SHA-256 over de IPv4-ruimte triviaal te bruteforcen zijn.
create table public.app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at bijhouden
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger reports_touch_updated_at
  before update on public.reports
  for each row execute function public.touch_updated_at();

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
