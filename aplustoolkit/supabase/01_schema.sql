-- ============================================================================
-- A+ Write — 01 schema
-- Run in the Supabase SQL Editor first. Safe to run again: every statement is
-- idempotent (if not exists / create or replace / drop … if exists).
-- ============================================================================

create extension if not exists pgcrypto;

-- Roles on a project, weakest first. The order is load-bearing: RLS checks
-- "at least editor" by comparing enum positions.
do $$ begin
  create type public.project_role as enum ('viewer', 'commenter', 'editor', 'owner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.share_permission as enum ('view', 'comment');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Profiles: one per signed-in user, created by trigger on signup.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale       text not null default 'sv' check (locale in ('sv', 'en')),
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Projects and their single script.
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  title      text not null default '',
  page_size  text not null default 'a4' check (page_size in ('a4', 'letter')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete: a writer who deletes a project by mistake gets it back.
  deleted_at timestamptz
);

create index if not exists projects_owner_idx on public.projects (owner_id) where deleted_at is null;

-- The Fountain+ source. `version` is the optimistic-concurrency counter:
-- every successful save increments it, and a save that names the wrong
-- version is refused rather than allowed to overwrite someone's work.
create table if not exists public.scripts (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  content    text not null default '',
  version    integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- ----------------------------------------------------------------------------
-- Revisions: named snapshots in the production colour sequence.
-- ----------------------------------------------------------------------------
create table if not exists public.revisions (
  id         uuid primary key default gen_random_uuid(),
  script_id  uuid not null references public.scripts (id) on delete cascade,
  label      text not null,
  color      text not null,
  content    text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists revisions_script_idx on public.revisions (script_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Character bible and locations — kept out of the script text on purpose.
-- ----------------------------------------------------------------------------
create table if not exists public.characters (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null,
  aliases    text[] not null default '{}',
  profile    jsonb not null default '{}'::jsonb,
  color      text,
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null,
  aliases    text[] not null default '{}',
  profile    jsonb not null default '{}'::jsonb,
  color      text,
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

-- Learned autocomplete entries, so a name taught on one machine is known on
-- the next.
create table if not exists public.dictionary_items (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind       text not null check (kind in ('character', 'location', 'tag')),
  value      text not null,
  created_at timestamptz not null default now(),
  unique (project_id, kind, value)
);

-- ----------------------------------------------------------------------------
-- Structured production data that is not script text: shotlists, storyboard
-- frames, pending assistant suggestions. One JSON document per key.
-- ----------------------------------------------------------------------------
create table if not exists public.project_data (
  project_id uuid not null references public.projects (id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (project_id, key)
);

-- ----------------------------------------------------------------------------
-- Membership and sharing.
-- ----------------------------------------------------------------------------
create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.project_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members (user_id);

create table if not exists public.share_links (
  token      text primary key default encode(gen_random_bytes(18), 'base64'),
  project_id uuid not null references public.projects (id) on delete cascade,
  permission public.share_permission not null default 'view',
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Comments are threaded and anchored to a scene's stable id plus an offset
-- inside it, so they survive the scene being moved or renumbered.
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_id  uuid references public.comments (id) on delete cascade,
  scene_id   text not null,
  anchor     integer not null default 0,
  body       text not null,
  resolved   boolean not null default false,
  author_id  uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_project_idx on public.comments (project_id, scene_id);

-- ----------------------------------------------------------------------------
-- Plumbing: updated_at, signup profile, owner membership, the script row.
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'projects', 'characters', 'locations', 'project_data', 'comments'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()',
      t, t);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A new project gets its owner as a member and an empty script, in the same
-- transaction — there is never a project nobody can open or with nothing in it.
create or replace function public.handle_new_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do update set role = 'owner';

  insert into public.scripts (project_id) values (new.id)
  on conflict (project_id) do nothing;
  return new;
end $$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- Saving the script bumps the project, so the dashboard sorts by real activity.
create or replace function public.touch_project_from_script()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.projects set updated_at = now() where id = new.project_id;
  return new;
end $$;

drop trigger if exists scripts_touch_project on public.scripts;
create trigger scripts_touch_project
  after update of content on public.scripts
  for each row execute function public.touch_project_from_script();
