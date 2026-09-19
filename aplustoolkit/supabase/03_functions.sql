-- ============================================================================
-- A+ Write — 03 functions
-- Run after 02_rls.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- save_script: optimistic-concurrency save.
--
-- The client says which version it last saw. If someone else saved in the
-- meantime, the save is refused with SQLSTATE P0409 and the current version in
-- DETAIL — the client then shows both versions and lets the writer choose.
-- Nothing is ever silently overwritten.
-- ----------------------------------------------------------------------------
create or replace function public.save_script(
  p_script_id uuid,
  p_content text,
  p_expected_version integer
)
returns table (version integer, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_project uuid;
  v_current integer;
  v_now timestamptz := now();
begin
  select s.project_id, s.version into v_project, v_current
  from public.scripts s
  where s.id = p_script_id
  for update;

  if v_project is null then
    raise exception 'script not found' using errcode = 'P0002';
  end if;

  if not public.has_project_role(v_project, 'editor') then
    raise exception 'not allowed to edit this script' using errcode = '42501';
  end if;

  if v_current <> p_expected_version then
    raise exception 'version conflict'
      using errcode = 'P0409', detail = v_current::text, hint = 'reload and resolve';
  end if;

  update public.scripts
  set content = p_content,
      version = v_current + 1,
      updated_at = v_now,
      updated_by = auth.uid()
  where id = p_script_id;

  return query select v_current + 1, v_now;
end $$;

-- ----------------------------------------------------------------------------
-- create_revision: snapshot the script in the next production colour.
-- White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry — then
-- round again, which is what a production that goes past Cherry does too.
-- ----------------------------------------------------------------------------
create or replace function public.create_revision(p_script_id uuid, p_label text)
returns public.revisions
language plpgsql security definer set search_path = public as $$
declare
  v_colors text[] := array['white', 'blue', 'pink', 'yellow', 'green', 'goldenrod', 'buff', 'salmon', 'cherry'];
  v_project uuid;
  v_content text;
  v_count integer;
  v_row public.revisions;
begin
  select project_id, content into v_project, v_content from public.scripts where id = p_script_id;
  if v_project is null then
    raise exception 'script not found' using errcode = 'P0002';
  end if;
  if not public.has_project_role(v_project, 'editor') then
    raise exception 'not allowed to revise this script' using errcode = '42501';
  end if;

  select count(*) into v_count from public.revisions where script_id = p_script_id;

  insert into public.revisions (script_id, label, color, content, created_by)
  values (p_script_id, coalesce(nullif(trim(p_label), ''), 'v' || (v_count + 1)),
          v_colors[(v_count % array_length(v_colors, 1)) + 1], v_content, auth.uid())
  returning * into v_row;

  return v_row;
end $$;

-- ----------------------------------------------------------------------------
-- get_shared_script: read a script through a share link.
--
-- Security definer so an anonymous reader can use it — but it returns exactly
-- one script, for exactly one valid token. There is no policy that would let
-- anyone list share links or scripts.
-- ----------------------------------------------------------------------------
create or replace function public.get_shared_script(p_token text)
returns table (
  project_id uuid,
  title text,
  page_size text,
  content text,
  version integer,
  permission public.share_permission
)
language sql stable security definer set search_path = public as $$
  select p.id, p.title, p.page_size, s.content, s.version, l.permission
  from public.share_links l
  join public.projects p on p.id = l.project_id and p.deleted_at is null
  join public.scripts s on s.project_id = p.id
  where l.token = p_token
    and (l.expires_at is null or l.expires_at > now());
$$;

-- ----------------------------------------------------------------------------
-- duplicate_project: a private copy for the caller, who needs only to be able
-- to read the original. Revisions and comments stay behind — a copy starts
-- its own history.
-- ----------------------------------------------------------------------------
create or replace function public.duplicate_project(p_project_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_new uuid;
  v_title text;
  v_size text;
begin
  if auth.uid() is null or not public.has_project_role(p_project_id, 'viewer') then
    raise exception 'not allowed to copy this project' using errcode = '42501';
  end if;

  select title, page_size into v_title, v_size from public.projects where id = p_project_id;

  insert into public.projects (owner_id, title, page_size)
  values (auth.uid(), v_title || ' (kopia)', v_size)
  returning id into v_new;

  update public.scripts
  set content = (select content from public.scripts where project_id = p_project_id),
      version = 1
  where project_id = v_new;

  insert into public.characters (project_id, name, aliases, profile, color)
  select v_new, name, aliases, profile, color from public.characters where project_id = p_project_id;

  insert into public.locations (project_id, name, aliases, profile, color)
  select v_new, name, aliases, profile, color from public.locations where project_id = p_project_id;

  insert into public.project_data (project_id, key, value)
  select v_new, key, value from public.project_data where project_id = p_project_id;

  return v_new;
end $$;

-- ----------------------------------------------------------------------------
-- Who may call what. Every function checks roles itself; these grants only
-- decide who may knock.
-- ----------------------------------------------------------------------------
revoke all on function public.save_script(uuid, text, integer) from public;
revoke all on function public.create_revision(uuid, text) from public;
revoke all on function public.duplicate_project(uuid) from public;
revoke all on function public.get_shared_script(text) from public;

grant execute on function public.save_script(uuid, text, integer) to authenticated;
grant execute on function public.create_revision(uuid, text) to authenticated;
grant execute on function public.duplicate_project(uuid) to authenticated;
grant execute on function public.get_shared_script(text) to anon, authenticated;
grant execute on function public.has_project_role(uuid, public.project_role) to authenticated;
