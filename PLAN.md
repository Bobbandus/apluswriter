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
- [ ] **M4 — Autocomplete.** Popover + ghost text, speaker prediction, Script
      Dictionary panel, typo guard (edit distance ≤ 2).
- [ ] **M5 — Pagination.** Deterministic paginator, page view, `(MORE)` /
      `(CONT'D)` splits, runtime estimates, golden tests vs. reference PDFs.
- [ ] **M6 — Backend.** Supabase SQL scripts, auth, dashboard, autosave,
      offline sync, optimistic concurrency + conflict UI.
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
