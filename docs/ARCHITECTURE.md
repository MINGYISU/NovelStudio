# NovelStudio — Architecture

Companion to [PRD.md](./PRD.md). This document fixes the technical decisions so an AI coding agent does not have to guess. Change it deliberately, not as a side effect.

---

## 1. Overview

```
┌──────────────── Browser (Chrome / Edge / Safari) ────────────────┐
│  React + TypeScript UI (Vite build)                               │
│  Tiptap editor · react-arborist tree · React Flow maps            │
└──────────────────────────────┬────────────────────────────────────┘
                               │ JSON over HTTP, 127.0.0.1 only
┌──────────────────────────────▼────────────────────────────────────┐
│  Node.js + Fastify server (single process, single port)           │
│  REST API · validation (Zod) · backups · static files             │
└──────────────────────────────┬────────────────────────────────────┘
                               │ better-sqlite3 (synchronous)
┌──────────────────────────────▼────────────────────────────────────┐
│  Data directory  ~/Library/Application Support/NovelStudio/       │
│  novelstudio.db · assets/ · backups/ · config.json                │
└───────────────────────────────────────────────────────────────────┘
          │ manual / scheduled export
          ▼
   Cold backup folder (user-chosen, e.g. external drive / iCloud Drive)
   <book>/<timestamp>.novelstudio.json + .sha256
```

Why a server instead of browser-only storage: browser storage (IndexedDB/localStorage) is tied to the exact origin (`localhost:5173` ≠ `localhost:4317`), can be wiped by "clear site data", and cannot write files to a chosen folder. A tiny local server writes real files, which makes backups and cold backups trivial.

---

## 2. Technology choices

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js 24 LTS or newer (`.nvmrc` = 26) | Native TypeScript stripping is **not** relied on; use `tsx` for dev/scripts. |
| Language | TypeScript, `strict: true` | No `any` except at validated boundaries. |
| Frontend build | Vite (+ `@vitejs/plugin-react`) | Dev server (5173) proxies `/api` and `/assets` to Fastify (4318) with `changeOrigin`. The production build puts its own files under `/static/` so `/assets/` stays free for book images. |
| UI | React | Function components + hooks. |
| Routing | React Router | Routes in §6. |
| Server state | TanStack Query | Caching, optimistic updates, retries. |
| UI state | Zustand | Selection, panel visibility, editor status. |
| Styling | CSS Modules + CSS custom properties | Themes = variable sets. No CSS framework. |
| UI primitives | Radix UI (dialog, dropdown-menu, context-menu, popover, tooltip) | Accessible menus/dialogs without building them. |
| Icons | lucide-react | |
| Tree sidebar | **react-arborist** (+ its peers `react-dnd`, `react-dnd-html5-backend`) | Nested DnD, folding, inline rename, keyboard nav, virtualization. |
| Editor | **Tiptap** (free extensions only): StarterKit, Underline, Highlight (multicolor), TextAlign, CharacterCount, Placeholder | Custom mark `foreshadowAnchor` in M7b. No Tiptap Pro / paid extensions. |
| Story maps | **@xyflow/react** (React Flow) + **@dagrejs/dagre** for auto-layout | |
| Validation | **Zod** in `src/shared/schemas` | Same schemas on client and server. |
| Server | **Fastify** + `@fastify/static` + `@fastify/multipart` | |
| Database | SQLite via **better-sqlite3** | WAL mode, foreign keys on. `node:sqlite` is still a release candidate (stability 1.2) — revisit later; all DB access goes through `src/server/db/` so the driver is swappable. |
| IDs | `crypto.randomUUID()` | No ID library. |
| Unit/integration tests | Vitest (+ Fastify `inject` for API tests) | |
| E2E tests | Playwright (from M3) | Drag-and-drop and autosave flows. |
| Lint/format | ESLint (flat config, typescript-eslint, react-hooks, `@eslint/js`, `globals`) + Prettier | Docs are excluded from Prettier (`.prettierignore`). |
| Tooling | TypeScript **6.0.x** (typescript-eslint does not yet support 7), `concurrently` (runs server + Vite in `dev`), `@types/*` for node, react, react-dom, better-sqlite3 | Pinned to exact versions in `package.json`. |

**Dependency policy:** exact versions (`.npmrc` has `save-exact=true`). No dependency is added without being listed here first (see [AGENTS.md](../AGENTS.md)).

---

## 3. Repository layout

```
NovelStudio/
├─ AGENTS.md                  rules for AI coding agents
├─ README.md
├─ docs/                      PRD, architecture, roadmap, cold backup format
├─ package.json               single package (no workspaces)
├─ tsconfig.json              + tsconfig.server.json / tsconfig.client.json as needed
├─ vite.config.ts
├─ index.html
├─ NovelStudio.command        double-click launcher (§15)
├─ public/                    PWA manifest and icons (§15)
├─ src/
│  ├─ shared/                 PURE TypeScript: no DOM, no Node APIs, fully unit-tested
│  │  ├─ types.ts
│  │  ├─ schemas/             Zod schemas (API bodies, settings, cold backup format)
│  │  ├─ tree.ts              buildTree, validateMove, applyMove, invariants
│  │  ├─ numbering.ts         computeDisplayTitles, number formatters (roman, cn, …)
│  │  ├─ wordcount.ts         CJK-aware counting
│  │  ├─ prosemirror-text.ts  rich content JSON → plain text; text-node replace
│  │  ├─ foreshadow.ts        analyzeForeshadows → warnings
│  │  ├─ import-split.ts      TXT/Markdown chapter detection
│  │  └─ manuscript-export.ts Markdown / plain text rendering of the manuscript
│  ├─ server/
│  │  ├─ index.ts             start server (bind 127.0.0.1)
│  │  ├─ app.ts               build Fastify instance (used by tests too)
│  │  ├─ config.ts            data dir resolution, config.json read/write
│  │  ├─ security.ts          Host/Origin checks
│  │  ├─ db/
│  │  │  ├─ connection.ts
│  │  │  ├─ migrate.ts
│  │  │  └─ migrations/       001_init.sql, 002_….sql  (forward-only)
│  │  ├─ repos/               one module per table group (SQL lives here only)
│  │  ├─ routes/              one module per resource
│  │  ├─ services/
│  │  │  ├─ hot-backup.ts
│  │  │  ├─ cold-backup.ts    export / verify / settings
│  │  │  ├─ cold-backup-restore.ts   restore
│  │  │  ├─ cold-backup-location.ts  folder policy checks
│  │  │  ├─ content.ts        read/save section text
│  │  │  ├─ search-replace.ts find & replace across a book (ED-09)
│  │  │  ├─ import-text.ts    TXT/Markdown import preview + commit (IMP-02)
│  │  │  ├─ export-manuscript.ts  Markdown / TXT export (EXP-01)
│  │  │  ├─ hot-backup-restore.ts list + staged restore of hot backups (HOT-02)
│  │  │  ├─ snapshots.ts
│  │  │  └─ assets.ts
│  │  └─ scripts/
│  │     ├─ seed-dev.ts       fill .data-dev with a sample novel
│  │     ├─ cold-backup.ts    CLI export
│  │     ├─ restore-cold.ts   CLI restore
│  │     └─ verify-cold.ts    CLI verify a backup file
│  └─ client/
│     ├─ main.tsx, App.tsx, routes.tsx
│     ├─ api/                 typed fetch wrappers + TanStack Query hooks
│     ├─ stores/              Zustand stores
│     ├─ components/          shared UI (Button, Dialog, Toast, SaveStatus…)
│     ├─ pages/
│     │  ├─ library/
│     │  └─ workspace/
│     ├─ features/
│     │  ├─ manuscript/       sidebar tree, section details
│     │  ├─ editor/           Tiptap setup, toolbar, autosave hook
│     │  ├─ maps/
│     │  ├─ foreshadow/
│     │  ├─ codex/
│     │  └─ settings/
│     └─ styles/              tokens.css, themes.css
└─ tests/
   ├─ e2e/                    Playwright specs
   └─ fixtures/               sample TXT/MD, sample cold backups (fake content only)
```

Unit tests sit next to the code they test: `tree.test.ts` beside `tree.ts`.

### npm scripts (planned; M0 creates `dev`, `build`, `start`, `test`, `typecheck`, `lint`, `format`, `seed:dev`; M3 adds `test:e2e` — the rest arrive with their milestones)

| Script | Purpose |
|---|---|
| `dev` | Fastify (watch, `tsx`, port 4318) + Vite dev server (5173, opens the browser). Uses `NODE_ENV=development` and `NOVEL_DATA_DIR=./.data-dev`. |
| `build` | Type-check and build client to `dist/client`, server to `dist/server`. |
| `start` | Run the built server on port 4317 with the **real** data dir; serves the built client. |
| `test` | Vitest (unit + API). Every test uses a fresh temp data dir. |
| `test:e2e` | Playwright (Chromium) against its own server (port 4419) and Vite (5174) with a fresh temp data dir; it never touches `./.data-dev`. Run `npx playwright install chromium` once. |
| `typecheck`, `lint`, `format` | |
| `seed:dev` | Fill `.data-dev` with sample books. M3: an English book of about 190 sections (3 volumes × 3 parts × 5 chapters × 3 scenes, prologue, epilogue, made-up text) and a small Chinese-structured book. Does nothing if the sample book already exists. Maps, foreshadows and codex arrive with their milestones. |
| `backup:cold -- [--book <id>] [--out <dir>] [--include-snapshots]` | CLI cold backup export (all live books without `--book`; the saved folder without `--out`). Like every script it uses `./.data-dev` unless `NOVEL_DATA_DIR` is set or `NODE_ENV=production` (real data). |
| `restore:cold -- <file> [--data-dir <dir>] [--ignore-checksum]` | CLI restore into a data dir as a new book; reads `<file>.sha256` when present and stops on a mismatch unless `--ignore-checksum`. Works without the UI or the server. |
| `verify:cold -- <file>` | Validate schema + checksums of a cold backup (read-only). |

---

## 4. Data directory and environments

| Mode | Data directory | How |
|---|---|---|
| `npm start` (real writing) | `~/Library/Application Support/NovelStudio/` | Default when `NOVEL_DATA_DIR` is unset **and** `NODE_ENV=production`. |
| `npm run dev` | `./.data-dev/` (git-ignored) | Set explicitly by the `dev` script. |
| Tests | `os.tmpdir()/novelstudio-test-<random>/` | Created and deleted per test file. |
| Override | `NOVEL_DATA_DIR=/some/path` | Always wins. |

Without `NOVEL_DATA_DIR`, any non-production run (including `NODE_ENV` unset) falls back to `./.data-dev`, never to the real dir.

Guard: if `NODE_ENV !== 'production'` and the resolved data dir equals the real default **or is inside it** (compared after resolving symlinks, `..`, and case), the server **refuses to start**, before creating or opening anything. This prevents dev runs and agents from touching real data.

Layout:

```
<data dir>/
├─ novelstudio.db           (+ -wal, -shm)
├─ assets/<bookId>/<assetId>.<ext>
├─ backups/novelstudio-YYYYMMDD-HHmmss.db
├─ config.json              app-level settings that must survive a broken DB
├─ pending-restore.json/.db a hot backup restore waiting for the next start (§10.1)
└─ logs/server.log
```

`config.json` (validated by Zod, written atomically):

```json
{
  "configVersion": 1,
  "coldBackup": {
    "dir": "/Volumes/Backup/NovelStudio Cold Backups",
    "keepNewestPerBook": null,
    "includeSnapshots": false,
    "reminderDays": 7,
    "autoDaily": false,
    "autoDailyLast": { "date": "2026-10-21", "at": "2026-10-21T14:00:00.000Z", "ok": true, "message": "Backed up 1 changed book." },
    "last": { "<bookId>": { "at": "2026-10-20T18:49:09.400Z", "file": "/Volumes/…json" } }
  },
  "ui": { "lastOpenedBookId": null }
}
```

---

## 5. Database schema (migration `001_init.sql`, extended by later migrations)

Conventions: `TEXT` UUID primary keys; timestamps as ISO-8601 `TEXT` in UTC; JSON stored as `TEXT` and validated by Zod on read/write; `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`, `PRAGMA user_version` = migration number.

```sql
CREATE TABLE books (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  author        TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  cover_asset_id TEXT,                         -- FK added once assets exist
  settings      TEXT NOT NULL DEFAULT '{}',    -- BookSettings JSON (structure, display, foreshadow)
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT                          -- library trash
);

CREATE TABLE nodes (                          -- manuscript sections
  id            TEXT PRIMARY KEY,
  book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES nodes(id),    -- NULL = book root
  kind          TEXT NOT NULL CHECK (kind IN ('volume','part','chapter','scene')),
  title         TEXT NOT NULL DEFAULT '',
  position      INTEGER NOT NULL,             -- 0..n-1 among live siblings
  numbered      INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'draft',
  synopsis      TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '{"type":"doc","content":[]}',  -- Tiptap/ProseMirror JSON
  plain_text    TEXT NOT NULL DEFAULT '',     -- derived on save; used for search, export, cold backup
  word_count    INTEGER NOT NULL DEFAULT 0,   -- derived on save
  rev           INTEGER NOT NULL DEFAULT 0,   -- optimistic concurrency for content saves
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT                          -- section trash (subtree root only)
);
CREATE INDEX nodes_tree ON nodes(book_id, parent_id, position);

CREATE TABLE snapshots (
  id          TEXT PRIMARY KEY,
  node_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  word_count  INTEGER NOT NULL,
  reason      TEXT NOT NULL,                  -- 'open' | 'interval' | 'before-replace' | 'before-restore'
  created_at  TEXT NOT NULL
);

CREATE TABLE assets (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,                  -- original name, display only
  mime        TEXT NOT NULL,                  -- image/png | image/jpeg | image/webp | image/gif
  bytes       INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- M5
CREATE TABLE codex_categories (
  id             TEXT PRIMARY KEY,
  book_id        TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  position       INTEGER NOT NULL,
  field_template TEXT NOT NULL DEFAULT '[]'   -- [{key,label,type:'text'|'longtext'}]
);
CREATE TABLE codex_entries (
  id           TEXT PRIMARY KEY,
  book_id      TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  category_id  TEXT NOT NULL REFERENCES codex_categories(id),
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  fields       TEXT NOT NULL DEFAULT '[]',    -- [{key,label,type,value}] ordered
  image_asset_id TEXT REFERENCES assets(id),
  position     INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- M6
CREATE TABLE maps (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  template    TEXT NOT NULL,                  -- 'blank' | 'timeline' | 'plot-tree' | 'character-arc'
  data        TEXT NOT NULL,                  -- MapData JSON (see §9)
  position    INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- M7
CREATE TABLE foreshadows (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'planned', -- planned | planted | paid_off | abandoned
  color       TEXT NOT NULL DEFAULT '#c0841a',
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE TABLE foreshadow_occurrences (
  id            TEXT PRIMARY KEY,
  foreshadow_id TEXT NOT NULL REFERENCES foreshadows(id) ON DELETE CASCADE,
  node_id       TEXT REFERENCES nodes(id),    -- NULL if the section was purged
  role          TEXT NOT NULL CHECK (role IN ('setup','hint','payoff')),
  excerpt       TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  anchored      INTEGER NOT NULL DEFAULT 0,   -- M7b: has an in-text anchor mark
  anchor_state  TEXT,                         -- M7b: 'present' | 'missing'
  created_at    TEXT NOT NULL
);
```

Codex notes (M5): `fields` and `field_template` are read item by item, so one damaged item never hides the others. The codex tables are created by `002_codex.sql`. The "characters in this section" list (CDX-07) stores nothing: it matches the title, the `name` field and the comma-separated `aliases` field of every entry in the characters category against the section text (Latin names as whole words, case-insensitive; CJK names anywhere), in `src/shared/codex.ts`. The characters category is the one named "Characters" or whose template has an `aliases` field, so a renamed category keeps working.

Map notes (M6): the `maps` table is created by `003_maps.sql`. `data` is read item by item with `repairMapData` (`src/shared/schemas/map.ts`): a node, edge or link that cannot be read is left out of what the API returns and the map is flagged `damaged`, so one bad item never hides the rest. A damaged map is shown read-only and the server refuses to overwrite it (`MAP_DAMAGED`), so the stored text, including the unreadable part, is never replaced; duplicating it still copies the stored text unchanged. Maps have no revision column: a save replaces the whole JSON and the last writer wins (two tabs editing the same map can overwrite each other, unlike section text).

Foreshadow notes (M7): the `foreshadows` and `foreshadow_occurrences` tables are created by `004_foreshadows.sql`. Threads keep creation order (no position column). An occurrence's `node_id` normally stays when its section is trashed (restoring the section makes it live again); it is `NULL` only if the section was purged. A stored thread status or color this version does not know is shown as `planned` / the default color and the row is not rewritten. The dormancy threshold N lives in `books.settings.foreshadow.dormantAfter` (whole number 1–1000, default 10; an absent or invalid value falls back to 10 without touching the other settings keys).

Only the tables needed by the current milestone are created; later tables arrive in later migrations, exactly as grouped above.

### Invariants (checked by `assertTreeInvariants(nodes)` in tests and in a debug endpoint)

1. Every live node's `parent_id` is `NULL` or a live node in the same book.
2. No cycles.
3. Rank rule: `rank(child.kind) > rank(parent.kind)`.
4. Live siblings have positions exactly `0..n-1` with no gaps or duplicates.

---

## 6. HTTP API

All under `/api`, JSON in/out, bodies validated with Zod. Errors: `{ "error": { "code": "INVALID_MOVE", "message": "…" } }` with an appropriate status.

| Method & path | Purpose |
|---|---|
| `GET /books?sort=modified\|title&trashed=0\|1` · `GET /books/:id` · `POST /books` · `PATCH /books/:id` · `DELETE /books/:id` (trash) · `POST /books/:id/restore` · `DELETE /books/:id?purge=1&confirmTitle=…` | Library. Books carry `wordCount` (live sections only) and `coverUrl`. `PATCH` accepts `coverAssetId` (an asset of that book, or `null` to remove; the replaced cover asset is deleted), `structure` (the full per-kind structure settings, validated by `structureSettingsSchema`) and `display` (the editor appearance, `displaySettingsSchema`) and `foreshadow` (`{ dormantAfter }`, `foreshadowSettingsSchema`); only the given `settings` keys are replaced, the others are kept. Each settings key is validated on its own when read, so one invalid key falls back to its defaults without touching the others. Books also carry `display` and `foreshadow`. Books carry `structure` (defaults when the stored settings are absent or invalid). Trash/restore leave `updated_at` alone. Purge only works on trashed books, needs `confirmTitle` equal to the title (exact, case-sensitive), takes a hot backup first (aborts if that fails), deletes the rows in one transaction and then `assets/<bookId>/`. Editing or uploading to a trashed book is `409 BOOK_TRASHED`. |
| `GET /books/:id/tree` | `{ nodes }`: all nodes of a book, trashed ones included, **without** `content` (id, bookId, parentId, kind, title, position, numbered, status, synopsis, wordCount, deletedAt). Readable for a trashed book. |
| `POST /books/:id/nodes` | Create `{ kind, parentId, index?, title?, numbered? }` → `201 { node, nodes }`. Omitted `index` appends; omitted `numbered` uses the kind's `defaultNumbered` from `books.settings.structure` (built-in defaults when absent or invalid). Rank violation is `409 INVALID_PARENT`. |
| `PATCH /nodes/:id` | Rename / status / synopsis / numbered → `{ node }`. |
| `POST /nodes/:id/move` | `{ parentId, index }` → `{ nodes }` (the updated tree). Errors: `404 NOT_FOUND`, `409 INVALID_MOVE` (cycle or rank), `400 INVALID_INDEX`. Only `parent_id`/`position` of the affected rows change. |
| `DELETE /nodes/:id` (trash) · `POST /nodes/:id/restore` | Both return `{ nodes }`. Restoring a section that is not in the trash is `409 NOT_TRASHED`. Every write to a trashed book is `409 BOOK_TRASHED`. |
| `POST /nodes/:id/duplicate` | `201 { node, nodes }`. Copies the section with its live subtree (trashed descendants are left behind) right after the original, in one transaction. All copies get new IDs; content, synopsis, status and numbered are copied, snapshots are not. The copy of a titled section is named `<title> (copy)`; the original keeps its title. |
| `GET /nodes/:id` | Full node including `content` and `rev`. |
| `PUT /nodes/:id/content` | `{ content, rev }` → `200 { rev, wordCount }` or `409 STALE_REVISION`. `content` is validated against the ED-02 allow-list (`schemas/content.ts`); anything else is `400 VALIDATION_ERROR`. The server derives `plain_text` and `word_count`, takes a snapshot when due, and touches the book's `updated_at`. Saving text identical to the stored text is a no-op that returns the current `rev`. Trashed sections are `404`, sections of a trashed book `409 BOOK_TRASHED`. |
| `GET /nodes/:id/snapshots` · `GET /snapshots/:id` · `POST /snapshots/:id/restore` | Newest first, each with `reason`, `wordCount`, `createdAt` and a 160-character `excerpt`; the detail adds `plainText`. Restore snapshots the current text (`before-restore`), writes the snapshot's text, bumps `rev` and returns `{ node }`. |
| `POST /books/:id/search` · `POST /books/:id/replace` | Find & replace across the live sections of a book (ED-09). `search` takes `{ query (1–200 chars), caseSensitive? }` → `{ total, sections: [{ nodeId, count, excerpts }], skipped }` (read-only, so it also works for a trashed book; `skipped` counts sections with unreadable text). `replace` takes `{ query, replacement (≤ 2,000 chars, may be empty), caseSensitive?, nodeIds? }` → `{ replaced, sections: [{ nodeId, count, rev, wordCount }], skipped }`; omitted `nodeIds` means every section with a match. Matching is literal (no regex), non-overlapping, and only inside one text node, so a phrase split by bold or another mark is not matched. The whole replace is **one transaction**: every changed section first gets a `before-replace` snapshot, its text is rewritten (marks and anchors kept, `plain_text`, `word_count`, `rev` and anchor state updated) and the book's `updated_at` is touched; any failure changes nothing. Trashed sections and subtrees are never searched; a trashed book is `409 BOOK_TRASHED`. |
| `POST /books/:id/assets` (multipart, one `file` part) · `GET /assets/:bookId/:assetId` | Images. Type is sniffed from magic bytes (PNG/JPEG/WebP/GIF); anything else is `415 UNSUPPORTED_IMAGE_TYPE`, over 20 MB is `413 FILE_TOO_LARGE`. `GET /assets/…` is outside `/api` so `<img>` tags work. |
| `GET /books/:id/codex` · `POST /books/:id/codex/seed` | Codex. `GET` returns `{ categories, entries }` (entries carry `imageUrl`; readable for a trashed book). `seed` is idempotent and creates the eight default categories (PRD CDX-01..03) only for a book that has none; the client calls it the first time the Codex view opens, so older books need no data migration. |
| `POST /books/:id/codex/categories` · `PATCH /codex/categories/:id` · `POST /codex/categories/:id/move` · `DELETE /codex/categories/:id` | Category CRUD. `PATCH` takes `name` and/or `fieldTemplate` (changes affect new entries only). `move` takes `{ index }` and returns all categories. `DELETE` of a category with entries is `409 CATEGORY_NOT_EMPTY`. |
| `POST /books/:id/codex/entries` · `PATCH /codex/entries/:id` · `POST /codex/entries/:id/move` · `DELETE /codex/entries/:id` | Entry CRUD. A new entry copies the category template with empty values. `PATCH` takes `title`, `summary`, `fields` (the full ordered list; keys unique, `[a-z0-9_-]`, types `text`/`longtext`) and `imageAssetId` (an asset of the same book, or `null`; a replaced or removed image is deleted unless something else uses it, otherwise `400 INVALID_IMAGE`). `move` reorders inside the category. Every write to a trashed book is `409 BOOK_TRASHED`. |
| `GET /books/:id/maps` · `POST /books/:id/maps` · `PATCH /maps/:id` · `PUT /maps/:id/data` · `POST /maps/:id/duplicate` · `DELETE /maps/:id` | Story maps. `GET` returns `{ maps }` in order (readable for a trashed book), each with the parsed `data` and `damaged` (true when part of the stored JSON was unreadable). `POST` takes `{ template, title? }` (`blank`, `timeline`, `plot-tree`, `character-arc`; the server builds the starting layout, the default title is the template name) → `201 { map }`. `PATCH` renames (`{ title }`) → `{ map }`. `PUT …/data` takes `{ data }` (the whole `MapData`, validated by `mapDataSchema`: unique ids, edges only between existing nodes, hex colors, size limits) → `{ updatedAt }`; saving a `damaged` map is `409 MAP_DAMAGED`. `duplicate` copies the stored data as it is, right after the original → `201 { map }`. `DELETE` removes the map for good and returns `{ maps }`. Every write also touches the book's `updated_at`; writes to a trashed book are `409 BOOK_TRASHED`. |
| `GET /books/:id/foreshadows` · `POST /books/:id/foreshadows` · `PATCH /foreshadows/:id` · `DELETE /foreshadows/:id` · `POST /foreshadows/:id/occurrences` · `PATCH /occurrences/:id` · `DELETE /occurrences/:id` | Foreshadow threads. `GET` returns `{ threads }` in creation order, each with its `occurrences` (readable for a trashed book). `POST` takes `{ title, description?, status?, color?, notes? }` (status one of `planned`, `planted`, `paid_off`, `abandoned`; color `#rrggbb`) → `201 { thread }`; `PATCH` takes any of those fields → `{ thread }`; `DELETE` removes the thread and its occurrences (the manuscript is untouched) → `{ threads }`. Occurrences take `{ nodeId, role, excerpt?, note? }` (role `setup`, `hint` or `payoff`) and every occurrence write returns the whole `{ thread }`. A section that is not in this book or is in the trash is `409 INVALID_SECTION`. Every write touches the book's `updated_at`; writes to a trashed book are `409 BOOK_TRASHED`. |
| `GET /settings/cold-backup` · `PUT /settings/cold-backup` · `POST /settings/cold-backup/validate` · `POST /settings/cold-backup/choose-folder` | Cold backup settings (choose-folder runs the macOS picker, §10.2). `GET` returns `{ settings: { dir, keepNewestPerBook, includeSnapshots, reminderDays, autoDaily }, last, autoDailyLast, pickerSupported }`; `last` feeds the reminder badges. `PUT` only enforces the location *policy* (absolute, not inside the data dir or source folder: `400 COLD_BACKUP_LOCATION_INVALID`); an unplugged drive can still be saved. `validate` always answers `200 { ok, code?, message, willCreate }` and never creates anything. |
| `POST /books/:id/cold-backup` · `POST /cold-backup/all` · `POST /cold-backup/verify` | Export `{ dir?, includeSnapshots? }` (one-off location optional) → `{ result }` / `{ results }` (live books only; a book that fails does not stop the others). An unusable location is `409 COLD_BACKUP_LOCATION_UNAVAILABLE`, none configured `400 COLD_BACKUP_NOT_CONFIGURED`. `verify` re-checks the newest file recorded in `config.json` for each book (or `{ bookId }`). |
| `POST /import/cold-backup` · `POST /import/text` | Import. The cold backup import is multipart: `file` (the `.novelstudio.json`), optional `checksum` (the `.sha256`), optional field `ignoreChecksum=1`. A mismatch is `409 CHECKSUM_MISMATCH`; success is `201 { book, warnings, remapped }`. Invalid files are `400 INVALID_BACKUP`, newer formats `400 UNSUPPORTED_FORMAT_VERSION`. |
| `POST /import/text` | Text import (IMP-02/03), multipart: `file` (`.txt`, `.md`, `.markdown`; at most 25 MB, otherwise `413 FILE_TOO_LARGE` with nothing imported or truncated) plus fields `mode=preview\|commit`, `detect=0\|1` (default 1), and for commit optional `title` and `preset=english\|chinese`. Markdown headings and emphasis are only read when the file name ends in `.md`/`.markdown`. `preview` → `200 { encoding, detected, suggestedPreset, totalWords, sections: [{ kind, title, parentIndex, unnumbered, wordCount, excerpt }], warnings }` and writes nothing. `commit` → `201 { book, sectionCount, warnings }`: one transaction creates the book (default title: the file name; Chinese preset stored as the book's structure) and every section, then checks the tree invariants; any failure leaves no book behind. Errors: `415 IMPORT_NOT_TEXT` / `IMPORT_ENCODING`, `400 IMPORT_EMPTY`, `400 IMPORT_TOO_MANY_SECTIONS` (over 3,000). The client re-sends the file for the commit; the server keeps no state between the two calls. |
| `GET /books/:id/export?format=md\|txt` | Manuscript export download (EXP-01): `text/markdown` or `text/plain` as an `attachment` with a safe, encoded file name; reading order, display titles, trashed sections and their subtrees left out; readable for a trashed book; changes nothing. |
| `GET /hot-backups` · `POST /hot-backups/:name/restore` · `DELETE /hot-backups/pending-restore` | Hot backups (HOT-02). `GET` → `{ backups: [{ name, bytes, createdAt }] (newest first), pending, failed }`. `restore` accepts only a name of the form `novelstudio-YYYYMMDD-HHmmss.db` that exists in `backups/`, validates the file (SQLite integrity check, a `books` table, schema not newer than this app: otherwise `409 BACKUP_UNUSABLE`), stages it and writes a pending marker → `{ pending }`; nothing is replaced while the server runs (§10.1). `DELETE …/pending-restore` withdraws a pending restore or dismisses the notice about a failed one. |

Client routes: `/` (library), `/trash`, `/settings`, `/book/:bookId/manuscript/:nodeId?`, `/book/:bookId/maps/:mapId?`, `/book/:bookId/foreshadow`, `/book/:bookId/codex/:entryId?`, `/book/:bookId/settings`.

---

## 7. Manuscript tree algorithms (`src/shared/tree.ts`, `numbering.ts`)

All functions are pure and deterministic; the server is the source of truth and re-runs the same validation the client uses.

### 7.1 Move

`index` is the **final index in the destination sibling list after the moved node has been removed from its old list**. The react-arborist `onMove` index must be converted to this meaning in one adapter function (when moving down within the same parent, subtract one); this adapter has its own unit tests.

```
validateMove(nodes, nodeId, newParentId, index):
  node = live node nodeId, else NOT_FOUND
  if newParentId != null:
     parent = live node newParentId in same book, else NOT_FOUND
     if parent.id == node.id or isDescendant(parent, node): INVALID_MOVE (cycle)
     if rank(node.kind) <= rank(parent.kind):            INVALID_MOVE (rank)
  dest = live children of newParentId, ordered, excluding node
  if index < 0 or index > len(dest):                      INVALID_INDEX
  ok

applyMove (inside ONE transaction):
  old = live children of node.parentId ordered, excluding node → set positions 0..n-1
  dest = live children of newParentId ordered, excluding node
  insert node at index; set node.parentId = newParentId
  set positions 0..m-1 on dest
  touch books.updated_at
```

Descendants are untouched: they follow because only the moved node's `parent_id` changes. Keyboard moves (`Alt+↑/↓`, `Tab`, `Shift+Tab`) are translated into the same `(parentId, index)` call by `keyboardMoveTarget` in `tree.ts` (null when the move is impossible or breaks a rule).

**Client behavior (M3).** The sidebar updates the cached tree optimistically with `applyMove` and reverts it (plus an error notice) if the server refuses. While several writes are in flight, only the last one to settle applies the server tree or refetches, so an older response never overwrites newer optimistic state; keyboard moves read the cache, not the last render. Undo (`Cmd/Ctrl+Z` in the sidebar) is one level: it sends a normal move back to the previous parent and index. Fold state and sidebar width are UI state kept in `localStorage` per book; they hold no manuscript data and are not part of backups.

Trash: trashing sets `deleted_at` on the subtree root only and closes the gap in its old sibling list. Its descendants are considered trashed because an ancestor is. Restore appends to the original parent (if live) or to the root, after validating the rank rule (fallback: root).

### 7.2 Numbering

```
computeDisplayTitles(liveTree, structureSettings):
  counters = Map<string, number>
  walk tree depth-first, pre-order, siblings by position:
     cfg = settings[node.kind]
     if node.numbered:
        scopeId = cfg.restartWithin == 'book' ? 'root'
                  : nearest ancestor with kind == cfg.restartWithin ?.id ?? 'root'
        key = node.kind + ':' + scopeId
        n = counters[key] = (counters[key] ?? 0) + 1
        number = format(cfg.format, n)          // tokens: {n} {n:roman} {n:roman-lower} {n:cn} {n:alpha}
        display = title ? number + cfg.separator + title : number
     else display = title || '(untitled)'
```

`{n:cn}` must produce standard forms: 1→一, 10→十, 11→十一, 20→二十, 101→一百零一, 110→一百一十, 1000→一千, 1001→一千零一. Covered by table-driven tests.

The client computes display titles from the cached tree on every change (cheap: O(n)); the server uses the same function for exports and cold backups.

---

## 8. Editor and saving

- One Tiptap editor instance; switching sections calls `editor.commands.setContent(newContent, { emitUpdate: false })` and clears history, after flushing the pending save of the previous section.
- **Autosave** (`features/editor/autosave.ts`, plain TypeScript so it is unit-tested without React): one `SectionSaver` per section, kept in a registry for the life of the page. Debounce 1000 ms; flush on section switch, route change, `visibilitychange → hidden`, and `pagehide`. One in-flight save per section; later changes queue behind it. Small saves (≤ 60 KB) use `fetch(..., { keepalive: true })` so they survive an unload; browsers refuse larger keepalive bodies, so a large chapter relies on the earlier `visibilitychange` flush. A failed save keeps the text, shows `Error — click for details` and retries every 5 s (not for 4xx other than 409). Opening a section first waits for its pending save, so switching back never reads older text than was typed; unsaved text after an error or conflict is shown instead of the server's copy.
- **Revision check**: each save sends the `rev` it was based on; the server increments on success. `409` → status "Changed elsewhere — reload" and no further saves for that section until reload.
- **Derived fields** on the server: `plain_text` (`prosemirror-text.ts`: one block per paragraph, heading or quote paragraph, separated by blank lines; a hard break is `\n`; a horizontal rule is `* * *`; empty paragraphs are dropped) and `word_count` (shared `wordcount.ts`, applied to the plain text).
- **Word count rule** (`wordcount.ts`): each CJK ideograph, kana or hangul syllable counts 1; each run of other letters/digits (including apostrophes/hyphens inside words) counts 1; punctuation and whitespace count 0.
- **Snapshots** (server side, on content save): create one if none exists for this section since the server started, or the newest is older than 10 minutes. A snapshot holds the text being overwritten (the previous saved content), and none is taken when that text is empty. Reasons: `open` (first save since start), `interval`, `before-restore`. Prune to 50 per section.
- **Find in section**: a ProseMirror plugin that only adds decorations (`find-extension.ts`); matches stay inside one text block (they may cross formatting changes) and the document is never modified. `Cmd/Ctrl+F` opens it instead of the browser's page search.
- **Paste**: Tiptap's schema already drops unknown marks/nodes; additionally `transformPastedHTML` removes every attribute and element that is not formatting: inline `style` is reduced to bold/italic/underline/line-through/alignment, `class`, `data-*`, `<font>`, `<style>` and scripts are dropped. `Cmd+Shift+V` inserts plain text (ProseMirror's built-in behavior). The server re-checks stored content against the ED-02 allow-list, so a paste can never make saves fail.
- **Display settings** (book `settings.display`) are applied as CSS variables on the editor container only. M8 (DISP-02) adds the `sepia` theme, `paragraphSpacing` (0–2 em between paragraphs, default 0.6), `backgroundColor` (`#rrggbb` or `null`, overrides the theme's paper color) and an optional background picture: `backgroundImageAssetId` (an image uploaded to the same book; `400 INVALID_BACKGROUND` otherwise) with `backgroundImageOpacity` (0.05–1, default 0.3), drawn on a layer behind the text inside the editor panel. Older stored settings without the new keys read as the defaults. A replaced or removed background image is deleted unless the cover or a codex entry still uses the same asset (`isAssetInUse`). The image is persistent data, so it is part of the cold backup (§10.2).
- **Focus mode** (WS-03, client only, `focusMode` in the workspace store, never persisted): `Cmd/Ctrl+Shift+F` or the book menu hides the top bar, sidebar and right panel; `Esc` (outside text fields and dialogs) or the dimmed corner button leaves it. The save status stays visible in that corner button group so a failed save is never hidden. It only applies to the Manuscript view and is switched off when the workspace unmounts.
- **Find & replace across the book** (ED-09, `Cmd/Ctrl+Alt+F` or the book menu): the dialog first flushes every pending save (and refuses to continue while a save has failed or a section is stale), so the search sees what was typed; matches are listed per section in reading order with checkboxes; replacing sends the chosen section ids. After a replace the client drops the savers of the changed sections and bumps `contentEpoch`, which makes the open editor re-read its section from the server instead of saving old text over the replacement. Earlier text is in each section's `before-replace` snapshot (ED-10).

---

## 9. Story maps

`maps.data` JSON (validated by Zod):

```ts
type MapData = {
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    data: {
      title: string;
      description: string;
      color: string;                 // hex
      storyTime: string;             // free text, '' if unset
      links: Array<{ type: 'node' | 'codex'; id: string }>;
    };
  }>;
  edges: Array<{ id: string; source: string; target: string; label: string }>;
  viewport: { x: number; y: number; zoom: number };
  layoutDirection: 'TB' | 'LR';
};
```

- Saved with the same debounce pattern as the editor (whole JSON per save; maps are small): `MapSaver` (`features/maps/map-saver.ts`) waits 0.8 s after the last change, has one request in flight, keeps the data and retries after a failure, and is flushed when the map is closed and on `pagehide`. Only persistable changes count: dragging saves when the drag ends, selecting does not save, and the user's own pan/zoom saves the viewport. There is no revision check (see "Map notes" in §5).
- The query cache holds the newest local state of every map (the canvas writes into it as you edit) and is never refetched, so reopening a map can never show an older copy than the one just edited.
- Limits: 500 nodes, 1,000 edges and 50 links per node; text lengths are in `schemas/map.ts`.
- Edges are directed and unique per source/target pair; self-connections are refused. Deleting nodes or edges can be undone once (a toolbar button restores what was removed last).
- Templates (`shared/map-templates.ts`) only produce the starting nodes, edges and direction; the map stores no reference to its template other than its name in `maps.template`.
- Auto-layout (`shared/map-layout.ts`): dagre with `rankdir = layoutDirection`, using the measured node sizes, then `fitView`. Edges are given to dagre in reverse so siblings keep the order they were created in. Both directions have a toolbar button; choosing one also stores it as `layoutDirection`, which decides where the node handles sit.
- Link display uses the client's computed display titles (`shared/map-links.ts`), never a title stored in the map; a link whose target is trashed shows "<title> (in trash)", missing shows "(missing)". A section link opens `/book/:id/manuscript/:nodeId` and a codex link `/book/:id/codex/:entryId`; trashed and missing links are not clickable. Renaming or moving a section changes the label because the map view reads the same cached tree as the sidebar.
- A single custom node type renders title, `storyTime`, color strip, link chips, and a `+` handle (MAP-09).

---

## 10. Backups

### 10.1 Hot backups

`hot-backup.ts`: on startup (after migrations; skipped only if the database file has not changed since the newest backup, after a WAL checkpoint) and every 60 minutes, if a dirty flag (set by every write in `repos/`, via `HotBackupService.markDirty()`) shows changes since the last backup, run `VACUUM INTO '<data dir>/backups/novelstudio-YYYYMMDD-HHmmss.db'`, then prune to the newest 20. Also run immediately **before** any migration and before a hot-backup restore.

**Restore (HOT-02).** The running server never swaps its own database. `requestHotRestore` validates the chosen file (`db/inspect.ts`: `quick_check`, a `books` table, `user_version` not newer than the latest migration), copies it to `<data dir>/pending-restore.db` (so the keep-20 retention can never delete it), takes a fresh hot backup of the live database, and writes `pending-restore.json` last. At the next start, `applyPendingRestore` runs in `openDataStore` **before the database is opened**: it re-validates the staged file, moves the old `novelstudio.db`, `-wal` and `-shm` together into `backups/replaced-YYYYMMDD-HHmmss/` (never deleted, so text typed after the request is still recoverable), renames the staged file into place and removes the marker; a failed rename puts the old files back. If the staged file is no longer valid, the current database is kept and `pending-restore.failed.json` records why (shown in Settings until dismissed). A marker whose staged file is already gone (crash after the swap) is treated as applied. The normal startup then runs: migrations (with their own pre-migration backup for an older schema) and the startup hot backup. Images are not part of a hot backup: restoring only replaces the database, and image files stay where they are.

### 10.2 Cold backup

Format: [COLD_BACKUP_FORMAT.md](./COLD_BACKUP_FORMAT.md). Implementation in `services/cold-backup.ts`, shared by the API and the CLI scripts.

**Export(bookId, dir):**

1. Resolve `dir` (saved setting or one-off). Validate: absolute and not inside the data dir, the real data dir or the source folder (`COLD_BACKUP_LOCATION_INVALID`); exists and writable (write+delete a probe file), or missing with an existing writable parent (the folder is then created at write time, not during the check). Anything else → `COLD_BACKUP_LOCATION_UNAVAILABLE`. A failed check writes nothing, anywhere, and does not touch `config.json`.
2. In one read transaction, load the book, all nodes (live + trashed), codex, maps, foreshadows, occurrences, assets metadata, and optionally snapshots.
3. Build the document: nested manuscript tree in reading order, each node with `displayTitle` (from `numbering.ts`) and `plainText`; trash as a flat list; assets read from disk and base64-encoded with `sha256` verified against the DB value (mismatch → include anyway, add to `warnings`).
4. Validate with the Zod schema in `src/shared/schemas/cold-backup.ts`.
5. Serialize with `JSON.stringify(doc, null, 2)`; compute SHA-256 of the bytes.
6. Write `<dir>/<book-folder>/<file>.tmp` → `fsync` → rename to final name → `fsync` directory. Write `<file>.sha256` the same way, in `shasum` format: `<hex>  <file name>`. The book folder is the existing folder ending in `__<id8>`, else a new one. A file name that already exists (two exports in one second) gets `-2`, `-3`, … after the timestamp; an existing backup is never overwritten.
7. Re-read the final file, verify hash, parse, and compare `stats` with what was exported. Failure → delete the new files (and folders this export created), report error.
8. Update `config.json → coldBackup.last[bookId]`. Apply retention only if `keepNewestPerBook` is set, and only to files matching this book's ID in that folder.

Trash entries are ordered by `deletedAt`, then stale `position`, then id, so the order survives a restore. `content` is exported as stored and is only checked at restore: a section whose text cannot be read is exported with `content: null` and a warning, never blocking the backup.

**Restore(file, dataDir):** verify sidecar hash if present (warn on mismatch) → parse → check `format`/`formatVersion` (run upgraders for older versions; refuse newer) → Zod validate → if `book.id` exists in the target DB, build an old→new ID map for **every** entity and rewrite all references (`parent_id`, `cover_asset_id`, `image_asset_id`, map node links, occurrence `node_id`, `foreshadowAnchor` marks inside content) → write assets to disk with verified checksums → insert everything in one transaction → run `assertTreeInvariants` → done. On any error, roll back and delete written asset files. Details: `settings.display.backgroundImageAssetId` follows the same asset remap as the cover (removed with a warning if the image is not in the file), restored images keep the file's order, images are re-sniffed (an SVG or any non-image is skipped with a warning) and their file names are sanitized; section `content` that fails the ED-02 schema is rebuilt from `plainText` with a warning; a trashed section whose original parent is unknown goes to the root with a warning; `plainText` and `wordCount` are recomputed; codex categories and entries are restored with every id remapped (`categoryId`, `imageAssetId`), field keys and labels that break the rules are repaired and an entry whose category or image is missing is skipped or loses the image, each with a warning; maps are restored with new map ids and every node/codex link rewritten through the same ID map (node and edge ids inside a map are local to it and stay as they are), unreadable nodes, edges and links are left out and an unknown template becomes `blank`, each with a warning; a link whose target is not in the file is **kept unchanged** and reported once in the restore warnings, and because the map view resolves links inside its own book it shows "(missing)" every time the map is opened, so the information is never silently lost; foreshadows are skipped with a warning until their milestone adds them. The book keeps its original `createdAt`/`updatedAt`.

**Automatic daily cold backup (COLD-11).** Off by default (`coldBackup.autoDaily`, a Settings checkbox). When on, `ColdBackupService.runAutoDaily()` runs once after the server starts listening: if today's local date already has a successful run it does nothing; otherwise it checks the location (nothing is written if it is unavailable) and exports, with the normal `writeBook` path (atomic write, verify, never overwrite, retention only if configured), every live book whose `updated_at` is newer than its `coldBackup.last` entry or that has none. The outcome (`{ date, at, ok, message }`) is stored in `config.json → coldBackup.autoDailyLast` and shown in Settings; a failure (unplugged drive, no folder set, a book that failed) is recorded as `ok: false`, so the next start on the same day retries, and books already backed up are not exported again.

**Folder picker (`choose-folder`)**: the server runs `osascript -e 'POSIX path of (choose folder with prompt "Choose cold backup folder")'` with a fixed argument list (no string interpolation of user input) and returns the path; cancel → `null`. Only on macOS; elsewhere the text field is used.

---

## 11. Foreshadow analysis (`src/shared/foreshadow.ts`)

```
analyzeForeshadows(nodes, threads, { dormantAfter = 10 }):
  order = reading-order index of each live node (depth-first, pre-order); chapterIndex = number of
          numbered chapters at or before it (a scene counts as its chapter, a prologue as 0)
  for each thread:
     live = occurrences whose node is live, sorted by order
     orphaned = occurrences whose node is trashed, under a trashed parent, missing or NULL → ORPHANED
     setups, payoffs = filter live by role
     if payoffs and not setups                                      → PAYOFF_WITHOUT_SETUP
     if setups and payoffs and order(first payoff) < order(first setup) → PAYOFF_BEFORE_SETUP
     if setups and not payoffs and status != 'abandoned'            → SETUP_WITHOUT_PAYOFF (info level)
     consecutive live occurrences with chapterIndex gap > dormantAfter → DORMANT
  return warnings[] with { id, threadId, kind, level, message, nodeIds, occurrenceIds }
```

There is at most one warning per thread and kind (`id = threadId:kind`), so the id stays stable while sections are dragged around. `nodeIds` are the sections to badge: for `PAYOFF_BEFORE_SETUP` the payoffs before the first setup plus that setup; for `DORMANT` both ends of each long gap. The input is the whole tree including trashed nodes (`TreeNode[]`) and the threads with their occurrences; the pure helpers `computeReadingOrder`, `newWarnings` and `warningsByNode` sit beside it.

Runs on the client after every tree or foreshadow change, from the cached tree (optimistic moves included) and the cached threads, so a drag shows or clears a warning at once. The previous result is diffed by warning `id` to show a toast for newly created warnings of level `warning` (FS-06); the first result after a book loads never toasts, and `info` warnings never toast. A toast that comes right after another notice with an action (trashing a section: "Restore") is merged into that notice so its button stays. Warnings appear in the Foreshadowing view, as a badge on the affected sidebar rows, and in the right panel's "Foreshadowing in this section" list. The dormancy threshold is edited in the Foreshadowing view and stored in the book settings.

**In-text anchors (M7b):** a Tiptap mark `foreshadowAnchor { occurrenceId }`. On every content save the server extracts anchor IDs from the content and, in the same transaction: sets `node_id` of those occurrences to this node (handles cut/paste between sections), sets `anchor_state = 'present'`; anchored occurrences previously pointing to this node but no longer found get `anchor_state = 'missing'`. The same extraction runs when a snapshot is restored (`syncAnchors` in `repos/foreshadows.ts`, pure id helpers in `shared/foreshadow-anchors.ts`).

Rules: `occurrenceId` must be a UUID (content schema). Only occurrences of the same book are touched, so text pasted from another book cannot take one over; unknown ids (for example of a deleted occurrence) are ignored and the mark stays in the text without effect. If the same id appears in two sections (a copy instead of a cut), the section saved last owns the occurrence. Duplicating a section strips the anchors from the copy, so the original keeps them. Cut and paste inside the app keeps the anchor because `cleanPastedHtml` lets a UUID-shaped `data-foreshadow-anchor` attribute through. The mark can overlap other anchors and does not grow when typing at its edge. A present anchor decides the section: the occurrence's section cannot be edited by hand until the anchor is missing. Highlighting is a client-only decoration in the thread's color and a per-browser toggle (`localStorage`), never stored in the content. The mark is created by the client: *Mark as setup/hint/payoff* first creates the occurrence (excerpt = selected text) through the normal occurrence API, then applies the mark; `anchored` turns on at the next save. Restore rewrites anchor ids in section and snapshot content through the same old→new ID map as every other reference.

---

## 12. Import

- **Cold backup**: `Restore` above (always as a new book).
- **TXT/Markdown** (`import-split.ts`): decode UTF-8 (strip BOM; fall back to GB18030 if invalid UTF-8 and a Chinese decode succeeds), normalize newlines, split on heading lines matching:
  - `^\s*第[0-9０-９一二三四五六七八九十百千万零〇两]+[章回节卷部篇]\s*(.*)$`
  - `^\s*(Chapter|CHAPTER)\s+([0-9]+|[IVXLCDM]+)\b[\s.:—-]*(.*)$`
  - `^#{1,2}\s+(.*)$` (Markdown only)

  Kind mapping: `第…卷/部/篇` → volume; `第…章/回/节` and `Chapter N` → chapter; Markdown `#` → volume **only if** `##` headings also exist, otherwise every heading → chapter. Text before the first heading becomes an unnumbered "Front matter" chapter. Chapters after a volume heading become that volume's children. Titles strip the detected number (it is recomputed). Paragraphs become Tiptap paragraphs; Markdown inline `**bold**`/`*italic*` is converted, everything else stays plain text. Implementation details (M8): every non-empty line is one paragraph; a line of `***`, `---` or `___` (also spaced, e.g. `* * *`) becomes a scene break; a line longer than 100 characters is never a heading (so body text that happens to start with `第三章…` is not split); a `# Chapter 3: Title` heading keeps only `Title`; a heading longer than 200 characters is shortened with a warning; a file with no heading, or with detection off, becomes one chapter titled with the book title; more than 3,000 detected sections is refused (detection is almost certainly wrong). A file with `第…章`-style headings suggests the Chinese numbering preset (stored as the new book's structure), otherwise the English one. Files over 25 MB are refused, never truncated, and the dialog warns before uploading.
- Preview first (server returns the proposed structure without writing); commit in one transaction.

---

## 13. Security

- `server.listen({ host: '127.0.0.1', port })`. Never `0.0.0.0`.
- `onRequest` hook: reject if `Host` is not `127.0.0.1:<port>` or `localhost:<port>` (DNS-rebinding protection); for non-GET requests also require `Origin` to be one of those (or absent for CLI/tests).
- Body size limits: JSON 25 MB (large chapters), multipart images 20 MB, text/Markdown import 25 MB, cold backup import 1 GB.
- The manifest and icons are static files from the same origin; the Host check applies to them like everything else, and the CSP needs no change (`manifest-src` falls back to `default-src 'self'`).
- Asset uploads: sniff magic bytes; allow PNG/JPEG/WebP/GIF only; serve with the stored MIME, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: default-src 'none'`.
- File system writes only into the data dir and the validated cold backup folder; file names are generated, never taken from user input (user titles are slugified, see COLD_BACKUP_FORMAT §2).
- App CSP: `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'` (Tiptap/React Flow inline styles); no external hosts.
- No telemetry, no update checks, no CDN assets.

---

## 14. Testing strategy

| Layer | What | Where |
|---|---|---|
| Unit (Vitest) | tree validate/apply/invariants, numbering (incl. `{n:cn}` table), word count (EN/ZH/mixed), plain-text extraction, content schema, foreshadow analysis, import splitting, cold-backup names/stats, autosave state machine (`src/client/features/editor/autosave.test.ts`) | `src/shared/**/*.test.ts` |
| API (Vitest + `app.inject`) | CRUD, move persistence, stale revision 409, migrations from empty DB, hot backup created, cold backup export → restore **round-trip equality**, location-unavailable error, ID remap on restore | `src/server/**/*.test.ts` |
| Property test | 1,000 random valid/invalid moves on a random tree; invariants always hold; invalid ones rejected | `tree.property.test.ts` (plain loop with seeded RNG; no extra dependency) |
| E2E (Playwright) | PRD §13 scenarios, starting with drag Ch4 above Ch3, autosave on rapid switching; M8: focus mode, find & replace, display settings, text import, export, hot backup list, daily cold backup setting | `tests/e2e/` |

Round-trip equality means: export book A → restore into an empty data dir → export again → the two documents are identical except for `exportedAt`, `app`, and (if remapped) IDs.

---

## 15. Launcher and installable app (M8)

- **`NovelStudio.command`** (executable, repo root): `cd`s to its own folder, checks `GET /api/health` on `PORT` (default 4317); if the server answers it only opens the browser. Otherwise it finds `node` (adding the usual Homebrew/Volta/nvm locations to `PATH`, since a window opened from Finder has a minimal one), refuses to run without `node_modules`, runs `npm run build` when `dist/server/index.js` is missing or any file under `src`, `index.html` or `public` is newer, then starts `npm start` **in the foreground** of the Terminal window (Ctrl+C stops it) while a background loop opens the browser as soon as the health check passes. `PORT` and `NOVEL_DATA_DIR` from the environment are passed through, which is how it is tested against a temp data directory. It never writes anywhere itself.
- **PWA**: `public/manifest.webmanifest` (name, `start_url` `/`, `display: standalone`, theme colors, two PNG icons 192/512 in `public/icons/`) is linked from `index.html`; Vite copies `public/` to the root of `dist/client`, so Fastify serves `/manifest.webmanifest` and `/icons/*`. There is deliberately **no service worker**: the app already runs locally, desktop Chrome/Edge offer *Install app* from the manifest alone, and a worker would add a cache that could serve stale code. Installing only creates a window and Dock icon; the server must be running.
