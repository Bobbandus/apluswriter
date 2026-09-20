-- ============================================================================
-- A+ Live — 05_live.sql
-- Scoreboards and other overlays that OBS shows as a browser source.
--
-- Run after 01–04. Safe to run again.
--
-- The shape is the same as share links: the public sides (the overlay page and
-- the operator page) are anonymous and know only a token. Neither has a table
-- policy. They reach one board, through one function, for one valid token, so
-- nobody can list boards or find one they were not given a link to.
--
--   output_token   read only. This is the link that goes in OBS.
--   control_token  read, and write the board's *state* (the score). It cannot
--                  change the theme or the name, and it cannot read the other
--                  token. This is the link for the operator.
-- ============================================================================

create table if not exists public.live_boards (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  name          text not null default 'Tavla',
  -- What the board is. The state's shape depends on it; the app knows each one.
  kind          text not null,
  state         jsonb not null default '{}'::jsonb,
  theme         jsonb not null default '{}'::jsonb,
  -- Goes up by one on every change to state, theme or name, so a page that
  -- polls can ask "anything newer than N?" and get an empty answer when not.
  version       integer not null default 1,
  -- Hex, not base64: these end up in URL paths, where + and / do harm.
  output_token  text not null unique default encode(gen_random_bytes(12), 'hex'),
  control_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- The kinds are checked here rather than inline, so a later version can add one and re-run this file.
alter table public.live_boards drop constraint if exists live_boards_kind_check;
alter table public.live_boards add constraint live_boards_kind_check check (kind in ('score', 'pingis', 'handball', 'ranking', 'lower'));

create index if not exists live_boards_owner_idx on public.live_boards (owner_id) where deleted_at is null;

drop trigger if exists live_boards_touch on public.live_boards;
create trigger live_boards_touch before update on public.live_boards
  for each row execute function public.touch_updated_at();

create or replace function public.live_bump_version()
returns trigger language plpgsql as $$
begin
  if new.state is distinct from old.state
     or new.theme is distinct from old.theme
     or new.name is distinct from old.name then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

drop trigger if exists live_boards_bump on public.live_boards;
create trigger live_boards_bump before update on public.live_boards
  for each row execute function public.live_bump_version();

-- ----------------------------------------------------------------------------
-- Row level security: only the owner, and only through the table. The owner
-- can also rotate a link by setting a new token, which is what "new link" does.
-- ----------------------------------------------------------------------------
alter table public.live_boards enable row level security;

drop policy if exists live_boards_owner_all on public.live_boards;
create policy live_boards_owner_all on public.live_boards for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ----------------------------------------------------------------------------
-- get_live_board: what a page needs to draw a board.
--
-- p_since_version makes polling cheap: when nothing is newer the answer is no
-- rows at all. can_control tells the page which of the two tokens it was given.
-- ----------------------------------------------------------------------------
-- The id comes back too: it names the Realtime channel that tells a page to look again.
-- It is not a secret worth guarding (nothing in the channel carries data), only hard to guess.
-- A changed result type cannot be replaced in place, so the old version is dropped first.
drop function if exists public.get_live_board(text, integer);

create function public.get_live_board(p_token text, p_since_version integer default null)
returns table (
  id uuid,
  kind text,
  name text,
  state jsonb,
  theme jsonb,
  version integer,
  can_control boolean
)
language sql stable security definer set search_path = public as $$
  select b.id, b.kind, b.name, b.state, b.theme, b.version, (b.control_token = p_token)
  from public.live_boards b
  where (b.output_token = p_token or b.control_token = p_token)
    and b.deleted_at is null
    and (p_since_version is null or b.version <> p_since_version);
$$;

-- ----------------------------------------------------------------------------
-- update_live_state: the operator's write.
--
-- Version checked like save_script: a stale write raises P0409 with the current
-- version in DETAIL, and the caller reads again, applies its action again and
-- retries. Two people pressing "+" at once then lose no points.
-- Only `state` changes here; the size is capped because the token is all it takes.
-- ----------------------------------------------------------------------------
create or replace function public.update_live_state(p_control_token text, p_state jsonb, p_expected_version integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  board public.live_boards;
  new_version integer;
begin
  select * into board from public.live_boards
   where control_token = p_control_token and deleted_at is null
   for update;
  if not found then
    raise exception 'unknown or removed board' using errcode = '42501';
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object' or pg_column_size(p_state) > 32768 then
    raise exception 'state must be a JSON object under 32 kB' using errcode = '22023';
  end if;

  if board.version <> p_expected_version then
    raise exception 'stale board' using errcode = 'P0409', detail = board.version::text;
  end if;

  update public.live_boards set state = p_state where id = board.id returning version into new_version;
  return new_version;
end $$;

revoke all on function public.get_live_board(text, integer) from public;
revoke all on function public.update_live_state(text, jsonb, integer) from public;

grant execute on function public.get_live_board(text, integer) to anon, authenticated;
grant execute on function public.update_live_state(text, jsonb, integer) to anon, authenticated;
