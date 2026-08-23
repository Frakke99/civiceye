-- 00_supabase_stubs.sql — ALLEEN voor lokaal testen.
--
-- Supabase levert het auth-schema, de rollen en auth.uid(). Voor een gewone
-- Postgres+PostGIS stubben we die, zodat db/migrations/* onveranderd kan lopen
-- in CI zonder een Supabase-project. Deze file wordt NOOIT op Supabase
-- uitgevoerd.

create extension if not exists postgis;
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;

create table if not exists auth.users (
  id                uuid primary key default gen_random_uuid(),
  email             text,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

-- Supabase leest de JWT-claims uit een GUC; wij zetten die in tests met
--   select set_config('request.jwt.claim.sub', '<uuid>', true);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
