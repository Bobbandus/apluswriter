# A+ Toolkit

Sajten är **A+ Toolkit**: A+ Plan (skriva, planera), A+ Shoot och A+ Live (kommer).
**A+ Plan → Write** är det som tidigare hette A+ Write.

A professional Fountain screenwriting app for [A+ Studios](https://aplusfilm.se).

Plain text underneath, a formatted screenplay on screen. Everything it writes
is valid Fountain 1.1, so a file made here opens correctly in Highland, Beat
or Final Draft.

See [`PLAN.md`](PLAN.md) for the architecture and milestone plan.

---

## Getting started

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run check` | `tsc --noEmit` + the full test suite. Green before every commit. |
| `npm run typecheck` | Types only |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run e2e` | Playwright editor flows |

## Layout

```
app/                 routes
components/          ui kit · icons · editor · navigator · inspector · shell
lib/fountain/        parser (Web Worker), AST, serializer, Fountain+
lib/paginator/       page geometry and pagination — shared by screen and PDF
lib/export/          pdf · fdx · fountain · html
lib/import/          fountain · fdx · highland · docx and pasted text
lib/storage/         StorageAdapter, Supabase and IndexedDB implementations
lib/platform/        web today, Electron later
messages/            sv.json (default) · en.json
supabase/            SQL Editor scripts
fixtures/            the official Fountain samples, plus edge cases
design-references/   the A+ Studios site, for design tokens
```

## Two rules worth knowing before changing anything

**The text is the source of truth.** The document is a plain Fountain string.
Formatting is drawn with CodeMirror decorations over that string. Nothing may
introduce a rich-text model that the writer's file has to be reconstructed
from.

**Page geometry lives in exactly one place.** `lib/paginator/geometry.ts` is
read by both the on-screen page and the PDF exporter. A second copy of those
numbers would drift, and a writer whose PDF paginates differently from their
screen has been lied to about how long their film is.

## Language

Swedish is the default and English is a peer, not a fallback. Every string
lives in `messages/`; none are hardcoded. The locale is a cookie rather than a
URL segment, because the language toggle belongs in settings.

## Design

Tokens are in [`styles/tokens.css`](styles/tokens.css), derived from the A+
Studios identity — studio green, REC red, gold, Space Mono labels, glass and
grain. Three themes are authored: Light, Dark and Midnight (true black).
Courier Prime is used for the screenplay and nothing else.
