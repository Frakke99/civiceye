-- 0005_storage.sql — Supabase Storage-buckets en -policies
--
-- Twee buckets, zie docs/adr/0005-foto-pipeline.md:
--   photo-inbox  — privé. Clients schrijven hier via een signed upload URL.
--                  Niemand kan lezen behalve service_role (de scanner).
--   photo-public — publiek leesbaar via CDN. Enkel de scanner schrijft hier.
--
-- Deze migratie doet niets buiten Supabase (geen storage-schema aanwezig).

do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage-schema niet aanwezig (lokale Postgres) — overgeslagen';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('photo-inbox',  'photo-inbox',  false, 5242880, array['image/jpeg', 'image/webp']),
    ('photo-public', 'photo-public', true,  5242880, array['image/jpeg', 'image/webp'])
  on conflict (id) do update
    set file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types,
        public             = excluded.public;

  -- Geen enkele policy op photo-inbox: uploads gebeuren met een signed URL die
  -- de Edge Function 'upload-url' uitreikt, en lezen mag enkel service_role.
  -- photo-public is public=true; schrijven kan alleen service_role.
  execute $pol$
    drop policy if exists photo_public_read on storage.objects;
  $pol$;

  execute $pol$
    create policy photo_public_read on storage.objects
      for select to anon, authenticated
      using (bucket_id = 'photo-public');
  $pol$;
end;
$$;
