-- 0006_moderation.sql — leesrechten en wachtrij voor de beheerdersconsole
--
-- Sprint 4 (docs/13): de console draait op een gewoon moderatoraccount
-- (profiles.trust_level >= 3) met het anon-key + JWT-model — géén
-- service_role in een browser. Daarvoor moet een moderator kunnen zien wát er
-- gerapporteerd is en waarom. moderation_events en report_audit blijven
-- onleesbaar voor elke client (docs/07); de console schrijft er indirect in
-- via moderate_report/block_user.

-- ---------------------------------------------------------------------------
-- Moderators lezen flags en foto's van alle meldingen
-- ---------------------------------------------------------------------------
drop policy if exists report_flags_moderator_read on public.report_flags;
create policy report_flags_moderator_read on public.report_flags
  for select to authenticated
  using ((select public.is_moderator()));

drop policy if exists report_photos_moderator_read on public.report_photos;
create policy report_photos_moderator_read on public.report_photos
  for select to authenticated
  using ((select public.is_moderator()));

-- ---------------------------------------------------------------------------
-- moderation_queue — de quarantainewachtrij, oudste eerst
-- ---------------------------------------------------------------------------
-- Oudste eerst is bewust: de reactietermijnen uit ADR 0008 (24 u voor
-- private_person, 72 u overig) gelden voor het óúdste item. De redenen komen
-- mee als jsonb zodat de console één query nodig heeft.
create or replace function public.moderation_queue(p_limit integer default 100)
returns table (
  report_id     uuid,
  kind          public.report_kind,
  size          public.litter_size,
  lat           double precision,
  lng           double precision,
  note          text,
  status        public.report_status,
  flag_count    smallint,
  photo_count   smallint,
  created_by    uuid,
  created_at    timestamptz,
  moderated_at  timestamptz,
  flags         jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    raise exception 'forbidden';
  end if;

  return query
  select
    r.id,
    r.kind,
    r.size,
    st_y(r.geom::geometry),
    st_x(r.geom::geometry),
    r.note,
    r.status,
    r.flag_count,
    r.photo_count,
    r.created_by,
    r.created_at,
    r.moderated_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'reason', f.reason,
               'detail', f.detail,
               'created_at', f.created_at
             ) order by f.created_at)
      from public.report_flags f
      where f.report_id = r.id
    ), '[]'::jsonb)
  from public.reports r
  where r.status = 'quarantined'
  order by r.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

grant execute on function public.moderation_queue(integer) to authenticated;
