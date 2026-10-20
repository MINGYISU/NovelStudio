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
├─ src/
│  ├─ shared/                 PURE TypeScript: no DOM, no Node APIs, fully unit-tested
│  │  ├─ types.ts
│  │  ├─ schemas/             Zod schemas (API bodies, settings, cold backup format)
│  │  ├─ tree.ts              buildTree, validateMove, applyMove, invariants
│  │  ├─ numbering.ts         computeDisplayTitles, number formatters (roman, cn, …)
│  │  ├─ wordcount.ts         CJK-aware counting
│  │  ├─ prosemirror-text.ts  rich content JSON → plain text; text-node replace
│  │  ├─ foreshadow.ts        analyzeForeshadows → warnings
│  │  └─ import-split.ts      TXT/Markdown chapter detection
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
| `GET /books?sort=modified\|title&trashed=0\|1` · `GET /books/:id` · `POST /books` · `PATCH /books/:id` · `DELETE /books/:id` (trash) · `POST /books/:id/restore` · `DELETE /books/:id?purge=1&confirmTitle=…` | Library. Books carry `wordCount` (live sections only) and `coverUrl`. `PATCH` accepts `coverAssetId` (an asset of that book, or `null` to remove; the replaced cover asset is deleted), `structure` (the full per-kind structure settings, validated by `structureSettingsSchema`) and `display` (the editor appearance, `displaySettingsSchema`); only the given `settings` keys are replaced, the others are kept. Each settings key is validated on its own when read, so one invalid key falls back to its defaults without touching the others. Books also carry `display`. Books carry `structure` (defaults when the stored settings are absent or invalid). Trash/restore leave `updated_at` alone. Purge only works on trashed books, needs `confirmTitle` equal to the title (exact, case-sensitive), takes a hot backup first (aborts if that fails), deletes the rows in one transaction and then `assets/<bookId>/`. Editing or uploading to a trashed book is `409 BOOK_TRASHED`. |
| `GET /books/:id/tree` | `{ nodes }`: all nodes of a book, trashed ones included, **without** `content` (id, bookId, parentId, kind, title, position, numbered, status, synopsis, wordCount, deletedAt). Readable for a trashed book. |
| `POST /books/:id/nodes` | Create `{ kind, parentId, index?, title?, numbered? }` → `201 { node, nodes }`. Omitted `index` appends; omitted `numbered` uses the kind's `defaultNumbered` from `books.settings.structure` (built-in defaults when absent or invalid). Rank violation is `409 INVALID_PARENT`. |
| `PATCH /nodes/:id` | Rename / status / synopsis / numbered → `{ node }`. |
| `POST /nodes/:id/move` | `{ parentId, index }` → `{ nodes }` (the updated tree). Errors: `404 NOT_FOUND`, `409 INVALID_MOVE` (cycle or rank), `400 INVALID_INDEX`. Only `parent_id`/`position` of the affected rows change. |
| `DELETE /nodes/:id` (trash) · `POST /nodes/:id/restore` | Both return `{ nodes }`. Restoring a section that is not in the trash is `409 NOT_TRASHED`. Every write to a trashed book is `409 BOOK_TRASHED`. |
| `POST /nodes/:id/duplicate` | `201 { node, nodes }`. Copies the section with its live subtree (trashed descendants are left behind) right after the original, in one transaction. All copies get new IDs; content, synopsis, status and numbered are copied, snapshots are not. The copy of a titled section is named `<title> (copy)`; the original keeps its title. |
| `GET /nodes/:id` | Full node including `content` and `rev`. |
| `PUT /nodes/:id/content` | `{ content, rev }` → `200 { rev, wordCount }` or `409 STALE_REVISION`. `content` is validated against the ED-02 allow-list (`schemas/content.ts`); anything else is `400 VALIDATION_ERROR`. The server derives `plain_text` and `word_count`, takes a snapshot when due, and touches the book's `updated_at`. Saving text identical to the stored text is a no-op that returns the current `rev`. Trashed sections are `404`, sections of a trashed book `409 BOOK_TRASHED`. |
| `GET /nodes/:id/snapshots` · `GET /snapshots/:id` · `POST /snapshots/:id/restore` | Newest first, each with `reason`, `wordCount`, `createdAt` and a 160-character `excerpt`; the detail adds `plainText`. Restore snapshots the current text (`before-restore`), writes the snapshot's text, bumps `rev` and returns `{ node }`. |
| `POST /books/:id/search` · `POST /books/:id/replace` | Find / replace across book. |
| `POST /books/:id/assets` (multipart, one `file` part) · `GET /assets/:bookId/:assetId` | Images. Type is sniffed from magic bytes (PNG/JPEG/WebP/GIF); anything else is `415 UNSUPPORTED_IMAGE_TYPE`, over 20 MB is `413 FILE_TOO_LARGE`. `GET /assets/…` is outside `/api` so `<img>` tags work. |
| Codex, maps, foreshadows | Conventional CRUD per resource, added in their milestones. |
| `GET /settings/cold-backup` · `PUT /settings/cold-backup` · `POST /settings/cold-backup/validate` · `POST /settings/cold-backup/choose-folder` | Cold backup settings (choose-folder runs the macOS picker, §10.2). `GET` returns `{ settings: { dir, keepNewestPerBook, includeSnapshots, reminderDays }, last, pickerSupported }`; `last` feeds the reminder badges. `PUT` only enforces the location *policy* (absolute, not inside the data dir or source folder: `400 COLD_BACKUP_LOCATION_INVALID`); an unplugged drive can still be saved. `validate` always answers `200 { ok, code?, message, willCreate }` and never creates anything. |
| `POST /books/:id/cold-backup` · `POST /cold-backup/all` · `POST /cold-backup/verify` | Export `{ dir?, includeSnapshots? }` (one-off location optional) → `{ result }` / `{ results }` (live books only; a book that fails does not stop the others). An unusable location is `409 COLD_BACKUP_LOCATION_UNAVAILABLE`, none configured `400 COLD_BACKUP_NOT_CONFIGURED`. `verify` re-checks the newest file recorded in `config.json` for each book (or `{ bookId }`). |
| `POST /import/cold-backup` · `POST /import/text` (preview + commit) | Import. The cold backup import is multipart: `file` (the `.novelstudio.json`), optional `checksum` (the `.sha256`), optional field `ignoreChecksum=1`. A mismatch is `409 CHECKSUM_MISMATCH`; success is `201 { book, warnings, remapped }`. Invalid files are `400 INVALID_BACKUP`, newer formats `400 UNSUPPORTED_FORMAT_VERSION`. |
| `GET /books/:id/export?format=md\|txt` | Manuscript export download. |

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
- **Display settings** (book `settings.display`) are applied as CSS variables on the editor container only.

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

- Saved with the same debounce pattern as the editor (whole JSON per save; maps are small).
- Auto-layout: dagre with `rankdir = layoutDirection`, then `fitView`.
- Link display uses the client's computed display titles; a link whose target is trashed shows "(in trash)", missing shows "(missing)".
- A single custom node type renders title, `storyTime`, color strip, link chips, and a `+` handle (MAP-09).

---

## 10. Backups

### 10.1 Hot backups

`hot-backup.ts`: on startup (after migrations; skipped only if the database file has not changed since the newest backup, after a WAL checkpoint) and every 60 minutes, if a dirty flag (set by every write in `repos/`, via `HotBackupService.markDirty()`) shows changes since the last backup, run `VACUUM INTO '<data dir>/backups/novelstudio-YYYYMMDD-HHmmss.db'`, then prune to the newest 20. Also run immediately **before** any migration and before a hot-backup restore.

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

**Restore(file, dataDir):** verify sidecar hash if present (warn on mismatch) → parse → check `format`/`formatVersion` (run upgraders for older versions; refuse newer) → Zod validate → if `book.id` exists in the target DB, build an old→new ID map for **every** entity and rewrite all references (`parent_id`, `cover_asset_id`, `image_asset_id`, map node links, occurrence `node_id`, `foreshadowAnchor` marks inside content) → write assets to disk with verified checksums → insert everything in one transaction → run `assertTreeInvariants` → done. On any error, roll back and delete written asset files. Details: images are re-sniffed (an SVG or any non-image is skipped with a warning) and their file names are sanitized; section `content` that fails the ED-02 schema is rebuilt from `plainText` with a warning; a trashed section whose original parent is unknown goes to the root with a warning; `plainText` and `wordCount` are recomputed; codex, maps and foreshadows are skipped with a warning until their milestones add them. The book keeps its original `createdAt`/`updatedAt`.

**Folder picker (`choose-folder`)**: the server runs `osascript -e 'POSIX path of (choose folder with prompt "Choose cold backup folder")'` with a fixed argument list (no string interpolation of user input) and returns the path; cancel → `null`. Only on macOS; elsewhere the text field is used.

---

## 11. Foreshadow analysis (`src/shared/foreshadow.ts`)

```
analyzeForeshadows(tree, displayInfo, threads, occurrences, { dormantAfter = 10 }):
  order = reading-order index for each live node; chapterIndex = index among numbered chapters
  for each thread:
     occ = occurrences with live nodes, sorted by order
     orphaned = occurrences whose node is trashed or missing        → ORPHANED
     setups, payoffs = filter by role
     if payoffs and not setups                                      → PAYOFF_WITHOUT_SETUP
     if setups and payoffs and order(first payoff) < order(first setup) → PAYOFF_BEFORE_SETUP
     if setups and not payoffs and status != 'abandoned'            → SETUP_WITHOUT_PAYOFF (info level)
     gaps between consecutive occurrences (in chapterIndex) > dormantAfter → DORMANT
  return warnings[] with { threadId, kind, nodeIds }
```

Runs on the client after every tree or foreshadow change. The previous result is diffed to show a toast for newly created warnings (FS-06).

**In-text anchors (M7b):** a Tiptap mark `foreshadowAnchor { occurrenceId }`. On every content save the server extracts anchor IDs from the content and, in the same transaction: sets `node_id` of those occurrences to this node (handles cut/paste between sections), sets `anchor_state = 'present'`; anchored occurrences previously pointing to this node but no longer found get `anchor_state = 'missing'`.

---

## 12. Import

- **Cold backup**: `Restore` above (always as a new book).
- **TXT/Markdown** (`import-split.ts`): decode UTF-8 (strip BOM; fall back to GB18030 if invalid UTF-8 and a Chinese decode succeeds), normalize newlines, split on heading lines matching:
  - `^\s*第[0-9０-９一二三四五六七八九十百千万零〇两]+[章回节卷部篇]\s*(.*)$`
  - `^\s*(Chapter|CHAPTER)\s+([0-9]+|[IVXLCDM]+)\b[\s.:—-]*(.*)$`
  - `^#{1,2}\s+(.*)$` (Markdown only)

  Kind mapping: `第…卷/部/篇` → volume; `第…章/回/节` and `Chapter N` → chapter; Markdown `#` → volume **only if** `##` headings also exist, otherwise every heading → chapter. Text before the first heading becomes an unnumbered "Front matter" chapter. Chapters after a volume heading become that volume's children. Titles strip the detected number (it is recomputed). Paragraphs become Tiptap paragraphs; Markdown inline `**bold**`/`*italic*` is converted, everything else stays plain text.
- Preview first (server returns the proposed structure without writing); commit in one transaction.

---

## 13. Security

- `server.listen({ host: '127.0.0.1', port })`. Never `0.0.0.0`.
- `onRequest` hook: reject if `Host` is not `127.0.0.1:<port>` or `localhost:<port>` (DNS-rebinding protection); for non-GET requests also require `Origin` to be one of those (or absent for CLI/tests).
- Body size limits: JSON 25 MB (large chapters), multipart images 20 MB, cold backup import 1 GB.
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
| E2E (Playwright) | PRD §13 scenarios, starting with drag Ch4 above Ch3, autosave on rapid switching | `tests/e2e/` |

Round-trip equality means: export book A → restore into an empty data dir → export again → the two documents are identical except for `exportedAt`, `app`, and (if remapped) IDs.
