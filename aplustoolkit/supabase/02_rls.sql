-- ============================================================================
-- A+ Write — 02 row level security
-- Run after 01_schema.sql. Every table has RLS on; access comes from
-- project_members. Share links are served by a security-definer function in
-- 03, never by an open policy — an anonymous "select where token = …" policy
-- would let anyone enumerate every shared script.
-- ============================================================================

-- Helper: does the current user hold at least `min_role` on the project?
-- Security definer so it can read project_members without recursing into
-- that table's own policies.
create or replace function public.has_project_role(p_project uuid, p_min public.project_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    join public.projects p on p.id = m.project_id
    where m.project_id = p_project
      and m.user_id = auth.uid()
      and m.role >= p_min
      and p.deleted_at is null
  );
$$;

create or replace function public.project_of_script(p_script uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.scripts where id = p_script;
$$;

alter table public.profiles         enable row level security;
alter table public.projects         enable row level security;
alter table public.scripts          enable row level security;
alter table public.revisions        enable row level security;
alter table public.characters       enable row level security;
alter table public.locations        enable row level security;
alter table public.dictionary_items enable row level security;
alter table public.project_data     enable row level security;
alter table public.project_members  enable row level security;
alter table public.share_links      enable row level security;
alter table public.comments         enable row level security;

-- ---------------------------------------------------------------- profiles
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (id = auth.uid());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------- projects
-- The owner clause is not redundant. `insert … returning` checks the new row
-- against this policy *before* the after-insert trigger has created the owner's
-- membership — so without it, every "create project" from the app (which is
-- insert + select) would fail. It also keeps a soft-deleted project visible to
-- its owner, so it can be restored.
drop policy if exists projects_member_select on public.projects;
create policy projects_member_select on public.projects for select
  using (owner_id = auth.uid() or public.has_project_role(id, 'viewer'));

-- Anyone signed in may create a project, but only as its owner.
drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects for insert
  with check (owner_id = auth.uid());

drop policy if exists projects_editor_update on public.projects;
create policy projects_editor_update on public.projects for update
  using (owner_id = auth.uid() or public.has_project_role(id, 'editor'))
  with check (owner_id = auth.uid() or public.has_project_role(id, 'editor'));

-- Only the owner may delete (and deletion is soft via deleted_at anyway).
drop policy if exists projects_owner_delete on public.projects;
create policy projects_owner_delete on public.projects for delete
  using (public.has_project_role(id, 'owner'));

-- ---------------------------------------------------------------- scripts
drop policy if exists scripts_member_select on public.scripts;
create policy scripts_member_select on public.scripts for select
  using (public.has_project_role(project_id, 'viewer'));

-- Writes go through save_script() so the version check cannot be skipped.
-- No insert/update/delete policies: RLS denies them for ordinary clients.

-- ---------------------------------------------------------------- revisions
drop policy if exists revisions_member_select on public.revisions;
create policy revisions_member_select on public.revisions for select
  using (public.has_project_role(public.project_of_script(script_id), 'viewer'));

-- Created through create_revision(); editors may relabel.
drop policy if exists revisions_editor_update on public.revisions;
create policy revisions_editor_update on public.revisions for update
  using (public.has_project_role(public.project_of_script(script_id), 'editor'));

-- ------------------------------------- per-project tables, one shape each
do $$
declare t text;
begin
  foreach t in array array['characters', 'locations', 'dictionary_items', 'project_data'] loop
    execute format('drop policy if exists %I_member_select on public.%I', t, t);
    execute format(
      'create policy %I_member_select on public.%I for select using (public.has_project_role(project_id, ''viewer''))',
      t, t);
    execute format('drop policy if exists %I_editor_write on public.%I', t, t);
    execute format(
      'create policy %I_editor_write on public.%I for all using (public.has_project_role(project_id, ''editor'')) with check (public.has_project_role(project_id, ''editor''))',
      t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- members
drop policy if exists members_member_select on public.project_members;
create policy members_member_select on public.project_members for select
  using (public.has_project_role(project_id, 'viewer'));

drop policy if exists members_owner_write on public.project_members;
create policy members_owner_write on public.project_members for all
  using (public.has_project_role(project_id, 'owner'))
  with check (public.has_project_role(project_id, 'owner'));

-- ---------------------------------------------------------------- share links
-- Managed by editors. Reading a shared script by token is get_shared_script().
drop policy if exists share_links_editor_all on public.share_links;
create policy share_links_editor_all on public.share_links for all
  using (public.has_project_role(project_id, 'editor'))
  with check (public.has_project_role(project_id, 'editor'));

-- ---------------------------------------------------------------- comments
drop policy if exists comments_member_select on public.comments;
create policy comments_member_select on public.comments for select
  using (public.has_project_role(project_id, 'viewer'));

drop policy if exists comments_commenter_insert on public.comments;
create policy comments_commenter_insert on public.comments for insert
  with check (public.has_project_role(project_id, 'commenter') and author_id = auth.uid());

-- Authors edit their own comments; editors may resolve anyone's.
drop policy if exists comments_author_update on public.comments;
create policy comments_author_update on public.comments for update
  using (author_id = auth.uid() or public.has_project_role(project_id, 'editor'));

drop policy if exists comments_author_delete on public.comments;
create policy comments_author_delete on public.comments for delete
  using (author_id = auth.uid() or public.has_project_role(project_id, 'owner'));
