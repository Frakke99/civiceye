-- 0002_rls.sql — Row Level Security
--
-- Uitgangspunt: de client (anon/authenticated JWT) mag **lezen** wat publiek is,
-- en schrijft **nooit** rechtstreeks. Alle writes gaan via de
-- `security definer`-functies in 0003, die de regels afdwingen.
-- De beheerdersconsole werkt met de service_role-key (server-side) en omzeilt
-- RLS bewust; elke handeling daar landt in moderation_events.

-- ---------------------------------------------------------------------------
-- Helper: is de huidige gebruiker moderator?
-- ---------------------------------------------------------------------------
create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select trust_level >= 3 from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Rechten intrekken: geen directe tabelwrites voor clients
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

alter table public.profiles             enable row level security;
alter table public.reports              enable row level security;
alter table public.report_photos        enable row level security;
alter table public.report_flags         enable row level security;
alter table public.report_confirmations enable row level security;
alter table public.cleanups             enable row level security;
alter table public.report_audit         enable row level security;
alter table public.moderation_events    enable row level security;
alter table public.service_areas        enable row level security;
alter table public.municipalities       enable row level security;
alter table public.app_config           enable row level security;

-- ---------------------------------------------------------------------------
-- reports: publiek leesbaar wat gepubliceerd is; je eigen meldingen altijd
-- ---------------------------------------------------------------------------
grant select on public.reports to anon, authenticated;

create policy reports_public_read on public.reports
  for select
  to anon, authenticated
  using (status in ('published', 'cleaned'));

create policy reports_own_read on public.reports
  for select
  to authenticated
  using (created_by = auth.uid());

create policy reports_moderator_read on public.reports
  for select
  to authenticated
  using (public.is_moderator());

-- ---------------------------------------------------------------------------
-- report_photos: enkel gescande foto's van zichtbare meldingen
-- ---------------------------------------------------------------------------
grant select on public.report_photos to anon, authenticated;

create policy report_photos_public_read on public.report_photos
  for select
  to anon, authenticated
  using (
    scan_status = 'safe'
    and exists (
      select 1 from public.reports r
      where r.id = report_photos.report_id
        and r.status in ('published', 'cleaned')
    )
  );

create policy report_photos_own_read on public.report_photos
  for select
  to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_photos.report_id
        and r.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- profiles: je ziet enkel je eigen profiel (v1 heeft geen publieke profielen)
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;

create policy profiles_own_read on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- flags / confirmations / cleanups: je eigen bijdragen zijn leesbaar,
-- schrijven gebeurt via functies
-- ---------------------------------------------------------------------------
grant select on public.report_flags to authenticated;
create policy report_flags_own_read on public.report_flags
  for select to authenticated
  using (flagged_by = auth.uid());

grant select on public.report_confirmations to authenticated;
create policy report_confirmations_own_read on public.report_confirmations
  for select to authenticated
  using (confirmed_by = auth.uid());

grant select on public.cleanups to authenticated;
create policy cleanups_own_read on public.cleanups
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Configuratie & gebieden: leesbaar (de app moet weten welke types aanstaan)
-- ---------------------------------------------------------------------------
grant select on public.app_config to anon, authenticated;
create policy app_config_read on public.app_config
  for select to anon, authenticated using (true);

grant select on public.service_areas to anon, authenticated;
create policy service_areas_read on public.service_areas
  for select to anon, authenticated using (is_active);

-- ---------------------------------------------------------------------------
-- Nooit leesbaar voor clients: audit en moderatielog.
-- Geen enkele policy = geen enkele rij, ook niet met RLS aan.
-- ---------------------------------------------------------------------------
-- (report_audit, moderation_events, municipalities: alleen service_role)
