-- ============================================================================
-- A+ Write — 04 storage
-- Run after 03_functions.sql.
--
-- Two private buckets. Every object lives under a folder named after its
-- project id — `<project-id>/whatever.pdf` — and access follows project
-- membership, exactly like the tables.
--
--   exports  PDFs and other files generated for a project
--   media    storyboard frames and other images the writer uploads
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('exports', 'exports', false), ('media', 'media', false)
on conflict (id) do nothing;

-- The first path segment as a project id, or null if it is not a uuid. A
-- plain cast would throw on a stray object and fail the whole query.
create or replace function public.project_of_object(p_name text)
returns uuid language plpgsql immutable as $$
declare v_first text := split_part(p_name, '/', 1);
begin
  if v_first ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_first::uuid;
  end if;
  return null;
end $$;

drop policy if exists aplus_objects_read on storage.objects;
create policy aplus_objects_read on storage.objects for select to authenticated
  using (
    bucket_id in ('exports', 'media')
    and public.has_project_role(public.project_of_object(name), 'viewer')
  );

drop policy if exists aplus_objects_insert on storage.objects;
create policy aplus_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('exports', 'media')
    and public.has_project_role(public.project_of_object(name), 'editor')
  );

drop policy if exists aplus_objects_update on storage.objects;
create policy aplus_objects_update on storage.objects for update to authenticated
  using (
    bucket_id in ('exports', 'media')
    and public.has_project_role(public.project_of_object(name), 'editor')
  );

drop policy if exists aplus_objects_delete on storage.objects;
create policy aplus_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('exports', 'media')
    and public.has_project_role(public.project_of_object(name), 'editor')
  );
