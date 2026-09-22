-- ============================================================================
-- A+ Write — 06 collaboration
-- Run after 01–03 (needs profiles, project_members, has_project_role). Safe to
-- run again, like every other script here.
--
-- Two things that were sitting half-built:
--
-- 1. A profile had only one free-text `display_name`, filled in once at
--    signup from an invite's metadata (or the part of the email before the
--    @) and never editable. First and last name, set by the writer.
--
-- 2. `project_members` and its RLS existed, but nothing could add a row to
--    it except a raw SQL insert — there was no invite. A share link
--    (`share_links`, `get_shared_script`) is a different thing: it is an
--    anonymous, read-only window with no name attached. This is the other
--    kind of sharing — a named collaborator, in their own dashboard, with a
--    role that can include write access.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Names. `display_name` stays — it is what the signup trigger fills in and
-- nothing here needs to change that — but a writer can now put an actual
-- first and last name on their own profile.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name  text;

-- A member's own row already covers this (profiles_self_update, 02_rls.sql):
-- RLS is row-level, so a policy that lets you update your row lets you update
-- any column on it, these two included. Nothing to add there.

-- A collaborator could see *that* someone else was on a project
-- (project_members is member-readable) but not their name — only their own
-- profile was selectable. Sharing is the point where that stops being enough.
drop policy if exists profiles_project_peers_select on public.profiles;
create policy profiles_project_peers_select on public.profiles for select
  using (
    exists (
      select 1 from public.project_members mine
      join public.project_members theirs on theirs.project_id = mine.project_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

-- ----------------------------------------------------------------------------
-- invite_project_member: add a collaborator by email.
--
-- Only an owner may call it. The account has to exist already — signups are
-- invite-only (see supabase/README.md), so "share with someone" and "give
-- someone an A+ Toolkit account" are deliberately two separate steps, done by
-- two different people: the studio owner invites the account in Supabase,
-- the project owner shares a project with the account once it exists.
-- Inviting an address with no account fails with a message the app can show
-- as-is, rather than silently doing nothing.
-- ----------------------------------------------------------------------------
create or replace function public.invite_project_member(p_project_id uuid, p_email text, p_role public.project_role default 'viewer')
returns public.project_members
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_row public.project_members;
begin
  if not public.has_project_role(p_project_id, 'owner') then
    raise exception 'not allowed to invite to this project' using errcode = '42501';
  end if;

  if p_role = 'owner' then
    raise exception 'invite as viewer, commenter or editor — ownership is not transferable here' using errcode = '22023';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'no A+ Toolkit account for that address yet' using errcode = 'P0002';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, v_user, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role
  returning * into v_row;

  return v_row;
end $$;

-- ----------------------------------------------------------------------------
-- remove_project_member: revoke access. An owner may remove anyone but the
-- last owner — a project that nobody can administer is worse than one with
-- an unwanted collaborator still on it.
-- ----------------------------------------------------------------------------
create or replace function public.remove_project_member(p_project_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owners integer;
begin
  if not public.has_project_role(p_project_id, 'owner') then
    raise exception 'not allowed to remove members from this project' using errcode = '42501';
  end if;

  select count(*) into v_owners from public.project_members
  where project_id = p_project_id and role = 'owner';

  if v_owners <= 1 and exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = p_user_id and role = 'owner'
  ) then
    raise exception 'a project needs at least one owner' using errcode = '22023';
  end if;

  delete from public.project_members where project_id = p_project_id and user_id = p_user_id;
end $$;

revoke all on function public.invite_project_member(uuid, text, public.project_role) from public;
revoke all on function public.remove_project_member(uuid, uuid) from public;

grant execute on function public.invite_project_member(uuid, text, public.project_role) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
