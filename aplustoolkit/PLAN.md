# A+ Write — Plan

A professional Fountain-based screenwriting app for A+ Studios.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## 1. Product principles

1. **The text is the truth.** The document is plain Fountain. Every feature is a
   view over that text or structured data derived from it. We never introduce a
   rich-text model that the writer's file has to be reconstructed from.
2. **Never lose a word.** Local write-ahead cache before network. Save status is
   always visible. Conflicts show a diff; they never silently overwrite.
3. **Keyboard first.** A writer should be able to write a feature without
   touching the mouse. Every action is reachable from ⌘K.
4. **Export must interoperate.** Anything we write opens correctly in Highland,
   Beat and Final Draft. All A+ extensions hide inside Fountain notes.
5. **Swedish is a first-class language**, not a translation afterthought.
6. **Minimalism (added 2026-09-20).** The writing surface stays calm. Anything
   beyond writing (curves, maps, word counts, timelines) is off by default and
   opened with a button that remembers the choice. No wall of open fields.
   Every phase ends with a screenshot review in Light, Dark and Midnight, on
   desktop and phone width.

---

## 2. Architecture

### 2.1 Layers

```
┌─ app/ (Next.js App Router) ───────────────────────────────┐
│  (marketing)  (auth)  app/[projectId]                     │
└───────────────┬───────────────────────────────────────────┘
                │
┌─ components/ ─┴───────────────────────────────────────────┐
│  ui kit · icons · editor · navigator · cards · inspector   │
└───────────────┬───────────────────────────────────────────┘
                │
┌─ lib/ ────────┴───────────────────────────────────────────┐
│  fountain/   parser (worker) · AST · serializer · plus     │
│  paginator/  shared by page view AND pdf export            │
│  export/     pdf · fdx · fountain · html · sides           │
│  import/     fountain · fdx · highland · docx/paste        │
│  storage/    StorageAdapter ── Supabase · IndexedDB        │
│  platform/   web now, electron later                       │
└───────────────────────────────────────────────────────────┘
```

### 2.2 The parse pipeline

```
keystroke → CodeMirror doc → dirty range → Worker
                                            │
                          incremental block re-parse
                                            │
                     AST delta + scene index + tables
                                            │
                ┌───────────────┬───────────┴────────┐
            decorations     navigator/cards      paginator
          (live formatting)    (structure)      (page geometry)
```

**Incremental unit:** the *block* — a run of lines bounded by blank lines. A
keystroke dirties at most the block it lands in plus its immediate neighbours
(because Character/Transition recognition depends on the blank line before and
after, and Dialogue depends on the preceding block). We re-lex only those
blocks and splice the result into the block list. Stable element IDs survive
the splice so decorations and the scene index don't churn.

**Budget:** < 4ms per keystroke on the incremental path for a 120-page script.
Measured by a benchmark in CI, not by feel.

**Why a worker:** a full re-parse of Big Fish (146 KB) must never block the
main thread's input handling. The worker owns the canonical AST; the main
thread holds only what it needs to render the current viewport.

### 2.3 Key decisions

| Decision | Choice | Why |
|---|---|---|
| Editor | CodeMirror 6 | Decoration model fits "plain text, formatted view" exactly. ProseMirror would force a rich-text doc model. |
| Source of truth | Fountain text | Requirement. Also makes conflict-merge and diff tractable. |
| Parser | Own, incremental, in TS | No existing JS Fountain parser is incremental, and none support the A+ extensions. |
| Pagination | One engine, two renderers | Screen and PDF must agree. A second implementation would drift. |
| Styling | CSS Modules + CSS vars | Native in Next.js with zero build plugins. Tokens are CSS variables either way, so theming is identical — vanilla-extract's type safety didn't justify another thing in the build that can break. |
| Persistence | `StorageAdapter` interface | Electron `FileSystemAdapter` drops in without touching features. |
| Collaboration | Not in v1 | But the doc stays a linear text buffer so Yjs can be layered on later without a content migration. |

---

## 3. Design language

Source: `design-references/` (A+ Studios site). The brand DNA carries over; the
poster-shop energy does not. A marketing page shouts once; a writing app is
looked at for eight hours straight.

**Carried over (identity):**

| Token | Value | Use in the app |
|---|---|---|
| `--accent` | `#3be389` studio green | Focus rings, active nav, caret, selection, the `+` in the mark |
| `--flare` | `#ff4b3e` REC red | Revision marks, errors, sprint-active, conflict |
| `--gold` | `#ffce3f` | Tags, scene numbers, notes (sticky yellow — a natural fit) |
| Space Mono | mono labels | Eyebrows, scene numbers, shortcut hints, element labels |
| Inter | UI body | All interface text |
| Archivo / Archivo Black | display | Brand mark, titles, empty states |
| Glass + grain | `backdrop-filter`, noise overlay | Sidebar, popovers — subtle, at ~40% of the site's intensity |

**Deliberately changed:**

- **Radii:** site uses 3–4px poster corners. App uses `4 / 8 / 12 / 16 / 999`.
- **Shadows:** site uses hard offset poster shadows. App chrome uses soft
  layered macOS shadows. Hard offsets stay on the marketing route only.
- **A real Light theme.** The site is dark-only. Writers want paper. Light is a
  designed theme, not an inversion — and so is Dark.
- **Calmer neutrals.** The site's near-black `#0b0b0c` becomes the Midnight
  theme. Default Dark sits a step lighter so text isn't glowing at 2am.

**Themes:** Light · Dark (default) · Midnight (true black). All three are
authored. Screenplay body is always Courier Prime 12pt; the page sheet is a
warm white, never pure `#fff`, to cut glare.

---

## 4. Fountain+ extension summary

All extensions live inside `[[...]]` notes or at positions other parsers ignore,
so every file we write stays valid Fountain 1.1. Full spec in
`docs/fountain-plus.md`.

| Extension | Syntax | Degrades to |
|---|---|---|
| Swedish sluglines | `INT. MATSAL - DAG` | Already valid Fountain |
| Numbered headings | `2. INT. MATSAL - DAG` | Scene number `2` stripped out |
| Scene cast | `[[CAST: Vilde, Noa-Li]]` | A note |
| Scene location | `[[LOCATION: Skolmatsal.]]` | A note |
| Tags | `[[#prop Revolver]]` | A note |
| Color / status | `[[color: blue]]` `[[status: locked]]` | A note |
| Stable ID | `[[id: s_8f2k]]` | A note (hidden in our editor) |
| Beats | `[[beat: Midpoint]]` | A note |
| TODOs | `[[todo: fix this]]` | A note |
| Project meta | `/* aplus:meta {json} */` | Boneyard (invisible everywhere) |

---

## 5. Milestones

- [x] **M1 — Foundation.** Scaffold, design tokens, UI kit, custom icon set,
      titlebar + three-pane shell, i18n (sv default / en).
- [x] **M2 — Parser.** Fountain 1.1 + A+ extensions, incremental, in a worker,
      with a full test suite against the spec examples and the official samples.
- [x] **M3 — Editor.** CodeMirror 6, live formatting decorations, Enter/Tab
      element state machine, ⌘1–⌘8 element switching, auto-uppercase, `(CONT'D)`.
- [x] **M4 — Autocomplete.** Popover + ghost text, speaker prediction, Script
      Dictionary panel, typo guard (edit distance ≤ 2).
- [x] **M5 — Pagination.** Deterministic paginator, page view, `(MORE)` /
      `(CONT'D)` splits, runtime estimates, golden tests vs. reference PDFs.
- [x] **M6 — Backend.** Supabase SQL scripts, auth, dashboard, autosave,
      offline sync, optimistic concurrency + conflict UI.
- [x] **M6.5 — Bridge + desktop shell + assistant tools** (cards, 31 MCP tools, Electron shell).
- [ ] **M7 — Structure.** Navigator tree, index card board with drag-reorder,
      Characters/Locations panels, rename-everywhere.
- [ ] **M8 — Revisions.** Named snapshots, production color sequence, element
      diff, revision marks in export.
- [ ] **M9 — Import / Export.** fountain · fdx · highland · docx/paste
      heuristics; PDF · fdx · fountain · html · character sides; title page form.
- [ ] **M10 — Polish.** Focus mode, sprints, ⌘K palette, find/replace, reports,
      share links, motion, dark mode, accessibility pass.
- [ ] **M11 — Ship.** Vercel config, `.env.example`, README, `docs/electron.md`.
- [x] **MCP server** (added outside the original brief). A stdio server in
      `mcp/` that plugs a Claude Desktop session straight into a folder of
      `.fountain` files, using this repository's own parser. Read tools are
      unrestricted; write tools reach synopses, scene metadata, notes and
      whitespace only — see `mcp/README.md` for why that boundary is fixed.

Commit and push at the end of each milestone.

---

## 5b. Roadmap v2 (decided 2026-10, after M4 landed)

Decided with the user through two yes/no rounds. Deferred ideas and rejected
features are listed in `ideas.txt` — read it before proposing anything new.

**The AI rule (updated 2026-09-20).** Claude assists when asked. It rewrites or
drafts text **only when the writer explicitly asks**, and everything it
produces arrives as a *suggestion* (a card with Use / Discard, or a +/- diff)
or as an answer in the chat. Nothing changes until the writer clicks Use, and
one Ctrl+Z takes it back. It never edits action or dialogue on its own, and it
follows the craft rules in `docs/handoff.md` (no dark mood without resolution,
no stock AI lines, the writer's own voice, the project's "Stil & ton" note).

**How Claude and the app talk.** Claude Desktop starts the MCP server. The MCP
server also listens on a local bridge (127.0.0.1, with an origin allowlist
and a token). The app, whether desktop or web on localhost, connects to that
bridge as a client. So Claude can see what is open (script, scene, selection)
and send suggestion cards that appear live in the app. The app cannot start a
Claude conversation by itself; MCP only works in the other direction. Direct
"Generate" buttons need the Claude API and are deferred (ideas.txt #1).

| # | Milestone | Scope |
|---|---|---|
| M4.1 | Writing-flow polish | Enter never hijacked by the popover; name suggestions only at cue position, case-insensitive; speaker prediction as ghost text; name typo guard with one-click fix; smarter Enter auto-detect |
| M5 | Pages + PDF | Paginator with break rules, (MORE)/(FORTS.); page view with real sheet gaps and page numbers; runtime per scene; PDF export (title page, scene numbers, watermark); golden tests vs reference PDFs |
| M6 | Storage + account | StorageAdapter: local (IndexedDB / desktop files) + Supabase. Cloud sync is the **main path**, but local file saving stays first-class, because nobody should be locked in. SQL scripts, magic link + Google auth, autosave with status, offline queue, conflict sheet |
| M6.5 | Desktop + bridge | `aplusdesktop/` Electron shell (file system, native window). Live bridge between the MCP server and the app. "Claude connected" indicator |
| MCP v2 | Assistant tools | Shotlists (incl. focal length), breakdown/tagging, shooting schedule, continuity check, "What happens next?", structure and pacing, "does this line sound like the character?", logline/synopsis, format check with +/- diffs, basic scene difficulty, character bible + casting call. Suggestion cards in the app (can be turned off), "what I have selected", ready-made prompts in Claude Desktop |
| M7 | Structure | Index-card board as a **separate view**, not in the main script. Drag to reorder scenes in the text. Acts and sequences in the navigator. Characters and locations panels |
| M8 | Revisions | Colour snapshots in a **submenu** under the version pill, not permanently on screen. Element-level compare, revision asterisks in PDF, restore |
| M8.5 | Storyboard | One image slot per shot in the shotlist. Behind a "Show storyboard" toggle. An empty slot is a thin row, not a big box |
| M9–M11 | Unchanged | Import/export, polish, ship |

---

## 5c. Roadmap v3 (decided 2026-09-20)

Priority 1 is finishing screenwriting. Work goes in **small phases**; each phase
ends green (`npm run check`, plus `npm run build` when the web app changed), is
committed and pushed to `main` (which deploys toolkit.aplusfilm.se). Tags and
GitHub Releases only when the owner says so. The phase checklist lives in
`docs/handoff.md`.

| Phase | Scope |
|---|---|
| 0 | Unblock: green build (`Script.sections`), login (env folder, account button on every page, invite-only sign-ups), dictionary saves only finished names, MCP instructions + craft rules |
| 1 | Claude may write on request: multi-hunk rewrite cards, alternatives, insert-scene, per-project "Stil & ton", new slash commands |
| 2 | Windows installer (NSIS, per user, bundled Next server), auto-update *proven* locally and against GitHub Releases, MCPB extension for Claude Desktop, download banner (hidden in desktop) |
| 3 | M7: sections in the navigator, `reorderScenes`, index-card board with drag, character/location panels, relationship map (opt-in), to-do panel |
| 4 | M8: revisions, automatic snapshots, PDF revision asterisks, scene alternatives (A/B, stored as boneyard in the text), MCP revision readers |
| 5 | M9: FDX/HTML/sides/report export, FDX/Highland/Word import, title-page form |
| 6 | M10: command palette, find & replace, spellcheck (dialogue/action only), cloud sync of project data, mirror to `.fountain` files, sprints, share/comments/roles, story days, energy curve (opt-in) |
| 7 | Polish after every phase |
| Next | Plan → Produktion (shotlist, stripboard, callsheet, props), then Casting, then Live and real-time co-writing |

### Are we ready? (readiness, 2026-09-20)

| Idea | Ready? | Already there | Missing | Proposal |
|---|---|---|---|---|
| Roles and permissions | Almost | `project_role`, RLS (`02_rls.sql`), `project_members`, `share_links` | invite function (SQL), member UI, read-only editor mode | Built in phase 6 |
| Produktion (stripboard, callsheet, day-out-of-days, props) | Yes, the data exists | `scheduleGroups`, `sceneDifficulty`, cast per scene, length in eighths | shooting-day data model, UI | After phase 6 |
| A+ Casting | Partly | character profiles, `casting_call` command, `characters` table, `media` bucket | candidates, notes, audition booking, the page | After Produktion |
| Real-time co-writing | **No** | the script is a raw text buffer (good for Yjs) | Yjs, a transport (Supabase Realtime or `y-websocket`), persistence of Y-state; `save_script` optimistic concurrency (`P0409`) conflicts with CRDT merging; IndexedDB cache must be reconciled with the Y.Doc | Wait until M7–M10 and roles are done, then a two-day spike |
| A+ Live | **No** | nothing | its own product: a realtime channel (Vercel serverless holds no sockets), an overlay renderer (browser source for OBS/vMix), operator view, data sources | Own spec and spike after Produktion, in its own folder |
| Discord bot/webhook | Yes, simple | — | — | Parked in `ideas.txt` |

---

## 6. Testing strategy

| Layer | Tool | Gate |
|---|---|---|
| Parser | Vitest | Every spec example + every official sample round-trips |
| Round-trip | Vitest | `serialize(parse(x)) === x` for all fixtures — byte exact |
| Paginator | Vitest golden | Page counts and break positions vs. reference PDFs |
| Incremental | Vitest | Incremental parse ≡ full re-parse, over random edit sequences |
| Performance | Vitest bench | < 4ms per keystroke on a 120-page script |
| Editor flows | Playwright | Enter/Tab flow, autocomplete, element switching |

`npm run check` = `tsc --noEmit` + `vitest run`. Green before every commit.

---

## 7. Open decisions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Default page size — A4 or Letter? | **A4** (Swedish studio), switchable per project |
| 2 | Tab on a Character line → parenthetical or extension? | **Parenthetical**, setting to swap |
| 3 | Does the marketing route need to match the live A+ site 1:1? | No — shared tokens, app-appropriate layout |
| 4 | Supabase project — does one exist, or is this a fresh one? | Assume fresh; SQL scripts are idempotent |
| 5 | Courier Prime licensing for self-hosting | SIL OFL — self-hosting is permitted |

---

## 8. Deferred (explicitly not v1)

- Real-time co-editing (Yjs) — data layer stays compatible.
- AI actions — `actions/` ships as a typed interface and a README only.
- Production breakdown module — tags are already collected in the scene index
  so it has clean data to build on.
- Mobile editing beyond a reading / light-edit view.
