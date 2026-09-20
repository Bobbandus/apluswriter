import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The Supabase scripts, run against real Postgres.
 *
 * PGlite is Postgres compiled to WebAssembly, so these are the actual SQL
 * files the user pastes into the SQL Editor, executed by an actual Postgres —
 * not a mock that agrees with whatever we assumed. Supabase's own `auth` and
 * `storage` schemas are stubbed with the few objects the scripts touch.
 *
 * The tests that matter most are the refusals: a stranger cannot see your
 * project, a viewer cannot edit, a stale save cannot overwrite.
 */

const SCRIPTS = ['01_schema.sql', '02_rls.sql', '03_functions.sql', '04_storage.sql', '05_live.sql'];
const read = (name: string) => readFileSync(join(process.cwd(), 'supabase', name), 'utf8');

const SUPABASE_STUBS = `
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean);
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text,
    name text,
    owner uuid
  );
  alter table storage.objects enable row level security;
`;

/** What Supabase grants by default; RLS is what actually restricts. */
const SUPABASE_GRANTS = `
  grant usage on schema public, auth, storage to authenticated, anon;
  grant all on all tables in schema public to authenticated, anon;
  grant all on all tables in schema storage to authenticated;
  grant execute on function auth.uid() to authenticated, anon;
`;

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';

let db: PGlite;

/** Runs SQL as a signed-in user (or anonymously), the way PostgREST would. */
async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(user ? `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);` : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}

/** The SQLSTATE a statement fails with, or null if it succeeds. */
async function errorCode(user: string | null, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await as(user, sql, params);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

async function newProject(user: string, title: string): Promise<{ project: string; script: string }> {
  const [project] = await as<{ id: string }>(user, 'insert into public.projects (owner_id, title) values ($1, $2) returning id', [user, title]);
  const [script] = await as<{ id: string }>(user, 'select id from public.scripts where project_id = $1', [project?.id]);
  return { project: project!.id, script: script!.id };
}

beforeAll(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  // Twice: the README promises the scripts are safe to re-run.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const name of SCRIPTS) await db.exec(read(name));
  }
  await db.exec(SUPABASE_GRANTS);
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}', 'alice@example.com', '{"full_name":"Alice"}'),
      ('${BOB}', 'bob@example.com', '{}');
  `);
}, 60_000);

describe('schema', () => {
  it('creates a profile on signup', async () => {
    const rows = await as<{ display_name: string }>(ALICE, 'select display_name from public.profiles');
    expect(rows).toEqual([{ display_name: 'Alice' }]);
  });

  it('gives a new project an owner and an empty script, version 0', async () => {
    const { project, script } = await newProject(ALICE, 'Jonathan II');
    const members = await as(ALICE, 'select user_id, role from public.project_members where project_id = $1', [project]);
    expect(members).toEqual([{ user_id: ALICE, role: 'owner' }]);
    const [row] = await as<{ content: string; version: number }>(ALICE, 'select content, version from public.scripts where id = $1', [script]);
    expect(row).toEqual({ content: '', version: 0 });
  });
});

describe('row level security', () => {
  it('hides a project from everyone who is not a member', async () => {
    const { project } = await newProject(ALICE, 'Private');
    expect(await as(BOB, 'select id from public.projects where id = $1', [project])).toEqual([]);
    expect(await as(BOB, 'select id from public.scripts where project_id = $1', [project])).toEqual([]);
    expect(await as(null, 'select id from public.projects where id = $1', [project])).toEqual([]);
  });

  it('does not let anyone create a project in someone else’s name', async () => {
    expect(await errorCode(BOB, 'insert into public.projects (owner_id, title) values ($1, $2)', [ALICE, 'Forged'])).toBe('42501');
  });

  it('does not let a client write the script table directly, bypassing the version check', async () => {
    const { script } = await newProject(ALICE, 'Direct');
    await as(ALICE, "update public.scripts set content = 'sneaky' where id = $1", [script]);
    const [row] = await as<{ content: string }>(ALICE, 'select content from public.scripts where id = $1', [script]);
    expect(row?.content).toBe('');
  });

  it('shows a project to a member, and hides it again once deleted', async () => {
    const { project } = await newProject(ALICE, 'Shared');
    await as(ALICE, "insert into public.project_members (project_id, user_id, role) values ($1, $2, 'viewer')", [project, BOB]);
    expect(await as(BOB, 'select title from public.projects where id = $1', [project])).toEqual([{ title: 'Shared' }]);

    await as(ALICE, 'update public.projects set deleted_at = now() where id = $1', [project]);
    expect(await as(BOB, 'select title from public.projects where id = $1', [project])).toEqual([]);
  });

  it('does not let a viewer invite others', async () => {
    const { project } = await newProject(ALICE, 'Invite');
    await as(ALICE, "insert into public.project_members (project_id, user_id, role) values ($1, $2, 'viewer')", [project, BOB]);
    expect(
      await errorCode(BOB, "insert into public.project_members (project_id, user_id, role) values ($1, $2, 'owner')", [project, BOB]),
    ).not.toBeNull();
  });
});

describe('save_script', () => {
  it('saves and bumps the version', async () => {
    const { script } = await newProject(ALICE, 'Saving');
    const [first] = await as<{ version: number }>(ALICE, 'select * from public.save_script($1, $2, 0)', [script, 'INT. KÖK - DAG']);
    expect(first?.version).toBe(1);
    const [second] = await as<{ version: number }>(ALICE, 'select * from public.save_script($1, $2, 1)', [script, 'INT. KÖK - NATT']);
    expect(second?.version).toBe(2);
  });

  /**
   * The rule the whole sync design rests on: a save that did not see the
   * latest version is refused, never applied. The client gets P0409 and the
   * current version, and shows the writer both texts.
   */
  it('refuses a stale save with P0409 and reports the current version', async () => {
    const { script } = await newProject(ALICE, 'Conflict');
    await as(ALICE, 'select * from public.save_script($1, $2, 0)', [script, 'mine']);
    try {
      await as(ALICE, 'select * from public.save_script($1, $2, 0)', [script, 'stale']);
      expect.unreachable('a stale save must fail');
    } catch (error) {
      expect((error as { code: string }).code).toBe('P0409');
      expect((error as { detail: string }).detail).toBe('1');
    }
    const [row] = await as<{ content: string }>(ALICE, 'select content from public.scripts where id = $1', [script]);
    expect(row?.content).toBe('mine');
  });

  it('refuses a viewer, and accepts an editor', async () => {
    const { project, script } = await newProject(ALICE, 'Roles');
    await as(ALICE, "insert into public.project_members (project_id, user_id, role) values ($1, $2, 'viewer')", [project, BOB]);
    expect(await errorCode(BOB, 'select * from public.save_script($1, $2, 0)', [script, 'nope'])).toBe('42501');

    await as(ALICE, "update public.project_members set role = 'editor' where project_id = $1 and user_id = $2", [project, BOB]);
    expect(await errorCode(BOB, 'select * from public.save_script($1, $2, 0)', [script, 'yes'])).toBeNull();
  });

  it('refuses a stranger', async () => {
    const { script } = await newProject(ALICE, 'Stranger');
    expect(await errorCode(BOB, 'select * from public.save_script($1, $2, 0)', [script, 'hi'])).toBe('42501');
  });
});

describe('create_revision', () => {
  it('walks the production colour sequence', async () => {
    const { script } = await newProject(ALICE, 'Revisions');
    const colors: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const [row] = await as<{ color: string; label: string }>(ALICE, "select * from public.create_revision($1, '')", [script]);
      colors.push(row!.color);
    }
    expect(colors).toEqual(['white', 'blue', 'pink']);
  });
});

describe('share links', () => {
  it('lets an anonymous reader open exactly one script with a valid token', async () => {
    const { project, script } = await newProject(ALICE, 'Shared read');
    await as(ALICE, 'select * from public.save_script($1, $2, 0)', [script, 'FADE IN:']);
    const [link] = await as<{ token: string }>(ALICE, 'insert into public.share_links (project_id) values ($1) returning token', [project]);

    const rows = await as<{ title: string; content: string }>(null, 'select title, content from public.get_shared_script($1)', [link?.token]);
    expect(rows).toEqual([{ title: 'Shared read', content: 'FADE IN:' }]);
  });

  it('returns nothing for an expired link', async () => {
    const { project } = await newProject(ALICE, 'Expired');
    const [link] = await as<{ token: string }>(ALICE, "insert into public.share_links (project_id, expires_at) values ($1, now() - interval '1 day') returning token", [project]);
    expect(await as(null, 'select * from public.get_shared_script($1)', [link?.token])).toEqual([]);
  });

  it('does not let anyone list share links', async () => {
    const { project } = await newProject(ALICE, 'Listing');
    await as(ALICE, 'insert into public.share_links (project_id) values ($1)', [project]);
    expect(await as(null, 'select token from public.share_links')).toEqual([]);
    expect(await as(BOB, 'select token from public.share_links')).toEqual([]);
  });
});

describe('duplicate_project', () => {
  it('makes a private copy with the script', async () => {
    const { project, script } = await newProject(ALICE, 'Original');
    await as(ALICE, 'select * from public.save_script($1, $2, 0)', [script, 'EXT. HAV - DAG']);
    const [row] = await as<{ duplicate_project: string }>(ALICE, 'select public.duplicate_project($1)', [project]);
    const copy = row?.duplicate_project;
    const [copied] = await as<{ title: string; content: string }>(
      ALICE,
      'select p.title, s.content from public.projects p join public.scripts s on s.project_id = p.id where p.id = $1',
      [copy],
    );
    expect(copied).toEqual({ title: 'Original (kopia)', content: 'EXT. HAV - DAG' });
  });

  it('refuses to copy a project the caller cannot read', async () => {
    const { project } = await newProject(ALICE, 'Not yours');
    expect(await errorCode(BOB, 'select public.duplicate_project($1)', [project])).toBe('42501');
  });
});

describe('storage', () => {
  it('lets members store files under their project, and nobody else', async () => {
    const { project } = await newProject(ALICE, 'Files');
    expect(await errorCode(ALICE, "insert into storage.objects (bucket_id, name) values ('media', $1)", [`${project}/frame.png`])).toBeNull();
    expect(await errorCode(BOB, "insert into storage.objects (bucket_id, name) values ('media', $1)", [`${project}/evil.png`])).not.toBeNull();
    expect(await as(BOB, "select name from storage.objects where bucket_id = 'media'")).toEqual([]);
  });
});

describe('live boards', () => {
  interface Board {
    id: string;
    output_token: string;
    control_token: string;
    version: number;
  }

  async function newBoard(user: string, kind = 'score'): Promise<Board> {
    const [board] = await as<Board>(
      user,
      "insert into public.live_boards (owner_id, name, kind, state, theme) values ($1, 'Match', $2, '{\"a\":0}', '{\"name\":\"Neon\"}') returning id, output_token, control_token, version",
      [user, kind],
    );
    return board!;
  }

  it('lets the owner see a board, and nobody else, and never lists boards to an anonymous visitor', async () => {
    const board = await newBoard(ALICE);
    expect(await as(ALICE, 'select id from public.live_boards where id = $1', [board.id])).toHaveLength(1);
    expect(await as(BOB, 'select id from public.live_boards where id = $1', [board.id])).toEqual([]);
    expect(await as(null, 'select id from public.live_boards')).toEqual([]);
  });

  it('gives tokens that are safe in a URL path', async () => {
    const board = await newBoard(ALICE);
    expect(board.output_token).toMatch(/^[0-9a-f]{24}$/);
    expect(board.control_token).toMatch(/^[0-9a-f]{24}$/);
    expect(board.output_token).not.toBe(board.control_token);
  });

  it('shows an anonymous page the board for either token, and says which one it holds', async () => {
    const board = await newBoard(ALICE, 'pingis');
    const [viewer] = await as<{ kind: string; name: string; can_control: boolean }>(null, 'select kind, name, can_control from public.get_live_board($1)', [board.output_token]);
    expect(viewer).toEqual({ kind: 'pingis', name: 'Match', can_control: false });
    const [operator] = await as<{ can_control: boolean }>(null, 'select can_control from public.get_live_board($1)', [board.control_token]);
    expect(operator?.can_control).toBe(true);
  });

  it('answers a made-up token with nothing, and a removed board with nothing', async () => {
    const board = await newBoard(ALICE);
    expect(await as(null, "select * from public.get_live_board('nonsense')")).toEqual([]);
    await as(ALICE, 'update public.live_boards set deleted_at = now() where id = $1', [board.id]);
    expect(await as(null, 'select * from public.get_live_board($1)', [board.output_token])).toEqual([]);
  });

  it('answers a poll with nothing when nothing is newer', async () => {
    const board = await newBoard(ALICE);
    expect(await as(null, 'select * from public.get_live_board($1, $2)', [board.output_token, board.version])).toEqual([]);
    expect(await as(null, 'select * from public.get_live_board($1, $2)', [board.output_token, board.version - 1])).toHaveLength(1);
  });

  it('lets the control link change the state and bump the version, and the output link cannot', async () => {
    const board = await newBoard(ALICE);
    const [result] = await as<{ update_live_state: number }>(null, 'select public.update_live_state($1, $2, $3)', [board.control_token, '{"a":1}', board.version]);
    expect(result?.update_live_state).toBe(board.version + 1);
    const [seen] = await as<{ state: { a: number } }>(null, 'select state from public.get_live_board($1)', [board.output_token]);
    expect(seen?.state).toEqual({ a: 1 });
    expect(await errorCode(null, 'select public.update_live_state($1, $2, $3)', [board.output_token, '{"a":2}', board.version + 1])).toBe('42501');
  });

  it('refuses a write from a stale version and says what the current one is', async () => {
    const board = await newBoard(ALICE);
    await as(null, 'select public.update_live_state($1, $2, $3)', [board.control_token, '{"a":1}', board.version]);
    let detail = '';
    try {
      await as(null, 'select public.update_live_state($1, $2, $3)', [board.control_token, '{"a":9}', board.version]);
    } catch (error) {
      expect((error as { code?: string }).code).toBe('P0409');
      detail = (error as { detail?: string }).detail ?? '';
    }
    expect(detail).toBe(String(board.version + 1));
  });

  it('refuses a state that is not an object or is far too large', async () => {
    const board = await newBoard(ALICE);
    expect(await errorCode(null, 'select public.update_live_state($1, $2, $3)', [board.control_token, '[1,2]', board.version])).toBe('22023');
    const huge = JSON.stringify({ x: 'a'.repeat(40_000) });
    expect(await errorCode(null, 'select public.update_live_state($1, $2, $3)', [board.control_token, huge, board.version])).toBe('22023');
  });

  it('cannot reach the theme or the name through the control link, and a theme change by the owner is a new version', async () => {
    const board = await newBoard(ALICE);
    await as(null, 'select public.update_live_state($1, $2, $3)', [board.control_token, '{"a":5}', board.version]);
    const [before] = await as<{ theme: { name: string }; version: number }>(null, 'select theme, version from public.get_live_board($1)', [board.output_token]);
    expect(before?.theme).toEqual({ name: 'Neon' });

    await as(ALICE, 'update public.live_boards set theme = $2 where id = $1', [board.id, '{"name":"Guld"}']);
    const [after] = await as<{ theme: { name: string }; version: number }>(null, 'select theme, version from public.get_live_board($1)', [board.output_token]);
    expect(after?.theme).toEqual({ name: 'Guld' });
    expect(after!.version).toBe(before!.version + 1);
  });

  it('does not let another user change or remove a board', async () => {
    const board = await newBoard(ALICE);
    await as(BOB, "update public.live_boards set name = 'Mine' where id = $1", [board.id]);
    await as(BOB, 'delete from public.live_boards where id = $1', [board.id]);
    const [row] = await as<{ name: string }>(ALICE, 'select name from public.live_boards where id = $1', [board.id]);
    expect(row?.name).toBe('Match');
  });

  it('lets the owner rotate a link, after which the old one stops working', async () => {
    const board = await newBoard(ALICE);
    await as(ALICE, "update public.live_boards set control_token = encode(gen_random_bytes(12), 'hex') where id = $1", [board.id]);
    expect(await errorCode(null, 'select public.update_live_state($1, $2, $3)', [board.control_token, '{"a":1}', board.version])).toBe('42501');
  });

  it('refuses a kind it does not know', async () => {
    expect(await errorCode(ALICE, "insert into public.live_boards (owner_id, kind) values ($1, 'roulette')", [ALICE])).not.toBeNull();
  });
});
