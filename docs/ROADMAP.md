# NovelStudio — Roadmap

Build one milestone at a time. Each milestone fits one AI coding session, ends with all checks green, a manual check by the user, and a commit. Do not start the next milestone until the current one is accepted.

Specs: [PRD.md](./PRD.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [COLD_BACKUP_FORMAT.md](./COLD_BACKUP_FORMAT.md) · Agent rules: [AGENTS.md](../AGENTS.md)

| # | Milestone | Key requirement IDs | Status |
|---|---|---|---|
| M0 | Skeleton & safety | DATA-01..05, HOT-01 | ☑ |
| M1 | Library | LIB-01..07 | ☑ |
| M2 | Tree logic & API (no UI) | TREE-01..03/08, MOVE-03..08, NUM-01..03 | ☑ |
| M3 | Sidebar with drag-and-drop | TREE-05..07/09..11, MOVE-01..11, NUM-04 | ☑ |
| M4 | Editor, autosave, **cold backup** | ED-01..08/10, DISP-01, SNAP-01, COLD-01..10, IMP-01, EXP-02 | ☑ |
| M5 | Codex | CDX-01..07 | ☑ |
| M6 | Story maps | MAP-01..09 | ☑ |
| M7 | Foreshadowing | FS-01..07 | ☑ |
| M7b | In-text foreshadow anchors | FS-08 | ☑ |
| M8 | Polish, import/export | WS-03, ED-09, DISP-02, HOT-02, IMP-02/03, EXP-01, COLD-11 | ☑ |
| M9 | Review fixes | TREE-08, ED-02/04/05/10/12, HOT-02, WS-01/02, CDX-01, MOVE-11, MAP-08, EXP-01, COLD-02, IMP-02 | ☑ |
| M10 | Interface language (English / 简体中文) | I18N-01..10 | ☑ |
| M11 | Images: illustrations and section header images | IMG-01..14, IMG-20..23, COLD-09 | ☐ |

**Finish M9 before writing real chapters.** The post-M8 review found ways typed text could be lost (see M9 group A). After M9, make sure a cold backup folder is set and one export has succeeded.

---

## How to prompt each milestone

Start every session with:

> Read `AGENTS.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, and `docs/ROADMAP.md`. We are doing milestone **Mx** only. First, restate the scope, list the files you will create or change, and list the tests you will write. Wait for my OK before coding.

After it finishes:

> Run `npm run typecheck`, `npm run lint`, and `npm test` (and `npm run test:e2e` from M3) and show me the results. Then give me a short manual test checklist for this milestone.

Then test manually, and commit when satisfied.

---

## M0 — Skeleton & safety

**Build**
- `package.json` with the scripts in ARCHITECTURE §3, exact versions, `engines.node >= 24`.
- TypeScript configs, Vite + React shell showing "NovelStudio" and a server health indicator.
- Fastify server: `127.0.0.1` binding, Host/Origin checks, `/api/health`, serves built client in production.
- Data dir resolution with the dev/test/prod rules and the **refuse-to-start guard** (ARCHITECTURE §4); `config.json` read/write (atomic).
- SQLite connection (WAL, foreign keys), migration runner with `user_version`, `001_init.sql` containing `books`, `nodes`, `snapshots`, `assets`.
- Hot backups (startup + hourly if changed, keep 20, before migrations).
- ESLint, Prettier, Vitest set up. `seed:dev` stub.

**Not in scope:** any real UI beyond the shell.

**Done when**
- [x] `npm run dev` opens the shell with dev data in `./.data-dev/`.
- [x] `npm run build && npm start` serves the app on `http://127.0.0.1:4317` using `~/Library/Application Support/NovelStudio/`.
- [x] Running dev with `NOVEL_DATA_DIR` pointing to the real dir is refused.
- [x] A hot backup file appears in `backups/` on start.
- [x] Tests: migration from empty DB, data dir resolution rules, Host check rejects `evil.com`.

## M1 — Library

**Build**: library grid, generated covers, cover upload (asset pipeline with type sniffing), create blank, edit metadata, trash/restore/purge with typed confirmation, sorting. Opening a book goes to an empty workspace placeholder.

**Done when**
- [x] Two books survive a restart; trash and restore work; purge requires the exact title.
- [x] Uploading a `.svg` or a renamed `.txt` as cover is rejected.
- [x] API tests for every library endpoint.

## M2 — Tree logic & API (no UI)

**Build**: `src/shared/tree.ts`, `numbering.ts` (all format tokens incl. `{n:cn}`), the node endpoints, trash/restore of sections, `assertTreeInvariants`, the seeded random move property test, the react-arborist index adapter (pure function, tested).

**Done when**
- [x] Unit tests: every rule in ARCHITECTURE §7; `{n:cn}` table; unnumbered sections; restart scopes.
- [x] Property test: 1,000 random moves keep invariants.
- [x] API test: move Ch4 before Ch3, restart server (new app instance on the same temp dir), order persists.

## M3 — Sidebar with drag-and-drop

**Build**: workspace layout (top bar, resizable sidebar, main panel placeholder, right details panel), react-arborist tree with custom row (indent, fold arrow, display title, status dot, word count on hover), drop rules via `disableDrop`, optimistic move with rollback, inline rename, context menu (new sibling/child, duplicate, unnumber, trash), keyboard moves, auto-expand on hover, single-level move undo, per-book fold state, structure settings dialog with English/Chinese presets. Playwright set up.

**Done when**
- [x] E2E: drag Ch4 above Ch3 → labels swap → reload → still swapped.
- [x] E2E: drag a Part into its own Chapter → refused, nothing changes.
- [x] Manual: moving feels immediate with the seeded sample book (~200 sections).

## M4 — Editor, autosave, cold backup

**Build**
- Tiptap editor with ED-02 formatting toolbar, find in section, paste cleaning, word counts (section/book/selection), display settings (DISP-01).
- Autosave hook with flush rules, revision checks (409 handling), save status in the top bar.
- Snapshots + snapshot browser/restore (ED-10).
- **Cold backup**: settings page (path field, Validate, Choose… picker), export this book / all books, verify, retention option, reminder badges, CLI `backup:cold`, `restore:cold`, `verify:cold`, import from library.

**Done when**
- [x] E2E: type, switch section within 200 ms, reload → text intact.
- [x] Two tabs editing the same section → the stale one shows "Changed elsewhere".
- [x] Round-trip test: export → restore into empty data dir → export → identical (except allowed fields).
- [x] Restore test with ID collision remaps all references.
- [x] Export to a missing folder fails with `COLD_BACKUP_LOCATION_UNAVAILABLE` and writes nothing anywhere.
- [x] Manual: `shasum -a 256 -c` succeeds on an exported file; the `jq` recipe in COLD_BACKUP_FORMAT §7 prints the manuscript.

## M5 — Codex

**Build**: categories with templates (defaults per PRD §8), entry cards, entry editor with add/rename/reorder/remove fields, images, search, "characters in this section" in the right panel. Extend cold backup + round-trip test.

**Done when**
- [x] Custom field persists after restart.
- [x] Category with entries cannot be deleted.
- [x] Round-trip test covers codex.

## M6 — Story maps

**Build**: map list, templates, React Flow canvas with custom node, edge labels, `+` child handle, dagre auto-layout (TB/LR), links to sections and codex entries, debounced save. Extend cold backup + round-trip test.

**Done when**: link click opens the section; renaming/moving that section updates the link label; positions persist.

## M7 — Foreshadowing

**Build**: threads CRUD, occurrences linked to sections, thread list in reading order, matrix view, `analyzeForeshadows` with all warning kinds, sidebar badges, toast on newly created warnings, right-panel thread list. Extend cold backup + round-trip test.

**Done when**: dragging the payoff chapter above the setup chapter immediately shows `PAYOFF_BEFORE_SETUP`; moving it back clears it.

## M7b — In-text foreshadow anchors

**Build**: `foreshadowAnchor` mark, *Mark as setup/hint/payoff* from selection, anchor extraction on save (ARCHITECTURE §11), anchor highlighting toggle, ID remap of anchors in cold backup restore.

**Done when**: cut an anchored sentence from Ch2 and paste into Ch5 → the occurrence now points to Ch5; delete it → *anchor missing*.

## M8 — Polish, import/export

**Build**: focus mode, find & replace across book (with snapshots), sepia theme/background image/paragraph spacing, hot backup list & restore, TXT/Markdown import with preview, Markdown/TXT export, optional daily cold backup, PWA manifest (so Chrome/Edge can "Install app"), a `NovelStudio.command` launcher (double-click: start server if not running, open browser).

**Done when**: all PRD §13 acceptance scenarios pass (automated where practical, the rest by a manual checklist).

**Acceptance coverage (PRD §13)**

| # | Scenario | Automated by | Manual |
|---|---|---|---|
| 1 | Two books survive a restart | `tests/e2e/acceptance.spec.ts` (reload), `library.test.ts` (server restart) | |
| 2 | Create volume/part/chapter/scene, collapse and expand | `acceptance.spec.ts`, `sidebar.spec.ts` (fold state) | |
| 3 | Drag Ch4 above Ch3 | `sidebar.spec.ts`, `nodes.test.ts` (restart) | |
| 4 | Move a chapter between parts | `sidebar.spec.ts`, `nodes.test.ts` | |
| 5 | Move a whole Part | `nodes.test.ts` (subtree moves), property test | Drag a Part in the UI |
| 6 | Refused drops | `sidebar.spec.ts` (Part into its own Chapter), `tree.test.ts` (rank rule) | |
| 7 | Unnumbered chapter renumbers the rest | `acceptance.spec.ts` | |
| 8 | Chinese preset | `acceptance.spec.ts` | |
| 9 | Type, switch, reload | `editor.spec.ts` | |
| 10 | Plot-tree map link follows renames | `maps.spec.ts` | |
| 11 | Payoff above setup warns | `foreshadow.spec.ts` | |
| 12 | Custom codex field survives a restart | `codex.spec.ts` (reload), `codex.test.ts` (restart) | |
| 13 | Cold backup → delete DB → `restore:cold` | `scripts/cli.test.ts`, `cold-backup.test.ts` (round trip incl. images, maps, foreshadows, codex) | `shasum -a 256 -c` and the `jq` recipe |
| 14 | Missing cold folder fails clearly | `cold-backup.spec.ts`, `cold-backup.test.ts` | Unplug a real drive |
| 15 | TXT with 第一章…第五章 | `tests/e2e/import-export.spec.ts`, `import-text.test.ts`, `import-split.test.ts` | |

## M9 — Review fixes

A review after M8 (all checks green: typecheck, lint, 687 unit/API tests, 59 E2E tests) found the problems below. M9 fixes them; it adds **no new features**. Each item says what is wrong, the required behavior (the decision is already made; ask before deviating), and the regression test. Every fix needs its test, per AGENTS.md.

Work in group order: **A** first (data safety), then **B**, then **C**. Splitting into several commits (`M9: …`) is fine; the milestone is accepted as a whole.

**Not in scope:** permanent deletion of trashed sections; changing the cold backup format; per-heading toggles in the import preview; a single-instance lock for the server; anything from *Later*.

### Group A — Data safety (must fix)

**A1. Trash list for sections (TREE-08).**
- *Problem:* a trashed section can only be restored from the notice bar, which closes after 10 s or when another notice replaces it. After that the section can't be reached from the UI, although `POST /api/nodes/:id/restore` exists and is tested. (The roadmap gave the API to M2 but never gave the UI to any milestone.)
- *Required:*
  - A **Trash** button in the sidebar footer, showing the number of trashed sections in this book. Hide the count when it is zero.
  - The button opens a dialog listing every node of this book with `deletedAt !== null`, newest first. For each node it shows: kind label, title (or `(untitled)`), deleted date and time, number of sections in its subtree, and the subtree's word count.
  - Each row has **Restore**. The dialog states where restored sections go: the end of their original parent, or the book root if that parent is gone or itself in the trash (existing `restoreNode` rule).
  - After restoring, select the section in the tree.
  - The notice bar's Restore action stays. There is no permanent delete.
  - Uses data the tree endpoint already returns (`GET /books/:id/tree` includes trashed nodes); no server change expected.
- *Tests:* E2E: trash a chapter with text, let the notice expire (or dismiss it), open Trash, restore. The chapter is back at its old place with its text and number, and the Trash count returns to zero.

**A2. A section must never become unsaveable (ED-02, ED-04, ED-05).**
- *Problem:* `src/shared/schemas/content.ts` rejects nesting deeper than 6. Five nested blockquotes reach that limit, and the editor creates them easily: pasting a quoted email thread, or typing `> ` repeatedly. Every save of that section then gets `400`, `src/client/api/content.ts` marks it non-retryable, and everything typed afterwards exists only in the browser. Reproduced: 4 levels save, 5 are rejected.
- *Required:*
  1. **Blockquotes never nest.** Add a pure `normalizeContent(doc)` in `src/shared/` (with tests). It unwraps every blockquote inside another blockquote, splicing its children into the outer quote in place, and keeps text, marks and order exactly.
  2. Apply `normalizeContent` in all of these places:
     - the editor, before `setContent` on load and before each save, so the screen and the stored text match;
     - the paste transform;
     - the server, before validating `PUT /nodes/:id/content`, so an old client cannot break a section;
     - cold backup restore, before the content schema check (section content and snapshot content);
     - find & replace and snapshot restore, if they re-validate content.
  3. The editor must not create nested quotes. The blockquote toggle/input rule inside a quote does nothing or lifts out; it never wraps again.
  4. The depth limit stays as a safety bound. After normalization, valid editor content stays well under it.
  5. **A rejected save is never silent.** If a content save fails with a non-retryable error:
     - the editor shows a persistent banner with the server's message and a **Copy section text** button (copies the editor's current plain text);
     - the top-bar status stays `Error` until a later save succeeds.
- *Tests:*
  - Unit: `normalizeContent` on 2–8 nested levels keeps `docToPlainText` identical, and the result passes `contentSchema`.
  - API: `PUT` with 6 nested quotes returns `200` and stores a flattened doc.
  - Restore: a backup section with 6 nested quotes restores with its formatting instead of being rebuilt from plain text.
  - E2E: paste HTML with 6 nested `<blockquote>`, type more, reload → all text present.

**A3. Leaving the page with unsaved text asks first (new ED-12).**
- *Problem:* nothing warns when the tab is closed while a save is pending, failing, or too large for `keepalive` (sections over 60 KB, about 20,000 Chinese characters).
- *Required:* a `beforeunload` handler that asks for confirmation whenever any section saver or map saver has unsaved changes, is saving, or is in `error`/`stale`. No prompt when everything is saved.
- *Tests:* unit test of the "has unsaved work" predicate over the saver registries. E2E: block the save route, type, then confirm the `beforeunload` dialog appears (Playwright `page.on('dialog')`).

**A4. Only the server applies a pending hot-backup restore (HOT-02).**
- *Problem:* `openDataStore` (`src/server/bootstrap.ts`) always calls `applyPendingRestore`, and the CLI scripts use it. Suppose a restore is requested in Settings and `backup:cold`, `restore:cold` or `seed:dev` runs before the restart. The database files are then swapped under the running server, and later writes land only in `backups/replaced-*`.
- *Required:*
  - `openDataStore` gets an option `applyPendingRestore` (default **false**). Only `src/server/index.ts` passes `true`.
  - If a restore is pending:
    - `restore:cold` and `seed:dev` refuse with exit code 1: "A hot backup restore is waiting for the next start. Restart NovelStudio (or cancel the restore in Settings) first." A book restored now would disappear at the next start.
    - `backup:cold` runs normally but prints a notice that it backs up the current database, not the pending one. A cold backup before a rollback is useful.
- *Tests:*
  - Bootstrap: with a pending marker, `openDataStore()` leaves the db/wal/shm files and the marker untouched, and `openDataStore({ applyPendingRestore: true })` applies it.
  - CLI (`scripts/cli.test.ts`): `restore:cold` with a pending marker exits 1 and inserts nothing.

**A5. Snapshot restore never silently discards unsaved text (ED-10).**
- *Problem:* `SnapshotDialog.tsx` calls `saver.flush()`, which resolves even when the saver ends in `error` or `stale`. The restore then proceeds and the reload drops the saver with its text.
- *Required:*
  - After the flush, if the section's saver is in `error` or `stale` or still has unsaved changes, do **not** restore.
  - Instead show: "This section has text that is not saved. Restoring the snapshot will discard it." with the buttons **Copy unsaved text**, **Restore anyway** (destructive styling) and **Cancel** (default).
- *Tests:* E2E or component test: make content saves fail, type, open Snapshots, restore. The warning appears and Cancel keeps the text. Restore anyway restores.

**A6. Trashing saves first.**
- *Problem:* `useTreeActions.ts` trashes without flushing, so text typed in the last second (or a failing save) in that section is lost; the later save gets `404`.
- *Required:*
  - Before trashing, flush the savers of the section **and every section in its subtree** (the open section may be a scene inside the chapter being trashed).
  - If any flush fails, do not trash; show an error notice: "Could not save the latest text, so the section was not moved to the trash."
- *Tests:* E2E: type in a chapter and trash it immediately, then restore it from Trash (A1). The text includes the last words typed.

### Group B — Correctness

**B1. Pasting from Google Docs is not all bold (ED-04).**
- *Problem:* `src/client/features/editor/paste.ts` drops `font-weight:normal`/`400`. Google Docs wraps the clipboard in `<b style="font-weight:normal" id="docs-internal-guid-…">`, which then becomes bold.
- *Required:*
  - The paste cleaner unwraps a `<b>`/`<strong>` whose inline `font-weight` is `normal` or below 600.
  - It turns a `<span>` with `font-weight` ≥ 600 or `bold` into bold.
  - The rest of the cleaning rules stay.
- *Tests:* unit tests with a made-up Google Docs fixture in `tests/fixtures/`: normal text, one bold word, one italic word. Only the bold word is bold.

**B2. Highlight colors survive copy/paste inside the editor (ED-04).**
- *Problem:* the cleaner strips `data-color` and `background-color` from `<mark>`, so the pasted highlight loses its color.
- *Required:* keep the highlight color on `<mark>` elements only, and only if it is one of `HIGHLIGHT_COLORS` (`src/shared/schemas/content.ts`). Background colors on other elements are still removed.
- *Tests:* unit test: `<mark data-color="<palette color>">` keeps its color; a `<span style="background-color:…">` loses it.

**B3. Last opened section is remembered across restarts (WS-01, WS-02).**
- *Problem:* `lastNodeByBook` (`src/client/stores/workspace.ts`) is memory-only, and library cards always open `/book/:id/manuscript` with nothing selected.
- *Required:*
  - Store the last opened section per book in `localStorage` (key `novelstudio:lastNode:<bookId>`), like the fold state. This is UI state, not book data, so it is not in the cold backup.
  - When `/book/:id/manuscript` opens without a node id, replace the URL with the remembered section if it is still live in the tree. Otherwise open with nothing selected, as today.
  - Library cards and the Manuscript tab rely on this redirect.
- *Tests:* E2E: open chapter B, go back to the library, reload the app, click the book. Chapter B is open and the URL contains its id. Then trash chapter B, reopen: nothing is selected and there are no errors.

**B4. Codex defaults are created with the book, not on view (CDX-01).**
- *Problem:* `CodexView.tsx` re-seeds the eight defaults whenever a book has zero categories. Deleting the last category, or restoring a backup without categories, silently brings them back.
- *Required:*
  - New books get the default categories **on the server when the book is created**, in the same transaction:
    - `LibraryService` create;
    - TXT/Markdown import commit.
  - Cold backup restore keeps exactly what the file contains.
  - Remove the automatic seeding from `CodexView.tsx`. The empty state shows an **Add default categories** button that calls the existing idempotent `POST /books/:id/codex/seed`. This is also how pre-M5 books get them.
  - No migration and no new stored data.
- *Tests:*
  - API: creating a book or importing text yields 8 categories.
  - E2E: delete every category, reopen the Codex view: still empty, and the button restores the defaults.
  - Cold backup round trip of a book with zero categories keeps zero.

**B5. Undo of a move cannot bring back an old entry (MOVE-11).**
- *Problem:* `useTreeActions.ts` keeps the previous undo entry before each move and puts it back if the move fails. With two moves in flight, a failure of the first overwrites the second's entry.
- *Required:* on failure, put the previous entry back **only if** the current undo entry is still the one this move created (compare identity).
- *Tests:* unit test of the undo bookkeeping: move A and move B in flight, A fails. The undo entry is still B's, and undo moves B back.

**B6. Map data this version cannot fully read is protected (MAP-08).**
- *Problem:* `repairMapData` (`src/shared/schemas/map.ts`) silently drops unknown keys in stored map data. The map is not flagged `damaged`, so the next save overwrites the stored JSON without them.
- *Required:*
  - When **reading stored data** or **restoring a backup**, unknown keys on the map data, nodes, node data, edges or links count as a problem. For stored data the map becomes `damaged` (read-only; the server refuses overwrite with `MAP_DAMAGED`). For a restore it is reported as a warning.
  - `PUT /maps/:id/data` request bodies keep today's behavior: React Flow's own keys such as `measured` are still stripped.
- *Tests:* unit: stored data with an unknown node key → `damaged: true` and a problem message. API: `PUT` on that map → `409 MAP_DAMAGED` and the stored text is byte-identical.

**B7. Exports include what was just typed (EXP-01, COLD-02).**
- *Problem:* the Markdown/TXT export is a plain `<a download>` link (`WorkspacePage.tsx`, `BookCard.tsx`) and does not flush pending saves. Check the cold backup export buttons for the same gap.
- *Required:*
  - Before any manuscript or cold backup export started from the UI, call `saverRegistry.flushAll()` (and flush map savers for cold backups).
  - If any saver is in `error`/`stale` afterwards, show: "Some text is not saved and will not be in the export." with **Export anyway** / **Cancel**.
  - Trigger the download after that, from code.
- *Tests:* E2E: type, immediately export Markdown. The downloaded file contains the last words typed.

**B8. Duplicating a map includes its latest edits (MAP-01).**
- *Problem:* duplicate (`MapList.tsx`) copies what the server has stored without flushing the open map's `MapSaver`.
- *Required:* flush the active map's saver first; if that fails, do not duplicate and show the error.
- *Tests:* E2E: add a node, duplicate within 0.8 s. The copy contains the node.

**B9. The launcher only opens the production server (ARCHITECTURE §15).**
- *Problem:* `NovelStudio.command` treats any `"status":"ok"` on the port as the real app. A dev server started with `PORT=4317` would be opened, and you would write into dev data.
- *Required:*
  - `is_running` also requires `"mode":"production"`.
  - If something else answers on the port, print "Port 4317 is used by a NovelStudio development server (or another program). Stop it, or set PORT." and wait for Return. Do not open the browser and do not start a second server.
- *Tests:* `bash -n NovelStudio.command`, plus a manual check (listed below). Shell tests are optional.

**B10. Chinese TXT import does not split on ordinary sentences (IMP-02).**
- *Problem:* the `第…[章回节卷部篇]` pattern (ARCHITECTURE §12) matches prose lines, for example `第二节课下课后，她走出教室。` (becomes a chapter) and `第二部手机响了。` (becomes a volume and swallows the following chapters).
- *Required:* after the `第<number><marker>` prefix, the rest of the line is the title, and the line is a heading only if all of these hold:
  - the title is empty, **or** starts with a separator (space, full-width space, `：`, `:`, `、`, `．`, `.`, `—`, `-`), **or** is at most 20 characters and contains no `，`;
  - the title does not end with `。`, `！`, `？`, `；` or `…`, ignoring closing quotes `”`, `」`, `』`.
  
  Update ARCHITECTURE §12 with the rule.
- *Tests:* table-driven unit tests in `import-split.test.ts`:
  - headings: `第一章`, `第一章 重逢`, `第十二章：风起`, `第三章重逢`, `第一卷 少年`;
  - not headings: `第二节课下课后，她走出教室。`, `第二部手机响了。`, `第一次见面时，他笑了。`.
  
  Existing import tests keep passing.

### Group C — Test gaps

**C1.** E2E: drag a chapter **down** within the same parent (Ch2 below Ch4). This is the case where `arboristIndexToFinalIndex` subtracts one. The labels renumber correctly and the order persists after a reload.

### Docs to update in the same change

- **PRD.md:**
  - Add ED-12 (done in this roadmap change; see §5).
  - In §15 (decisions log), replace the "Default Codex categories … created lazily" row with B4's decision.
  - Add rows for A2 ("blockquotes never nest") and A4.
- **ARCHITECTURE.md:**
  - §6: codex `seed` description (B4).
  - §8: normalization, rejected-save banner, `beforeunload`, flush before trash/export/snapshot restore.
  - §9: unknown map keys (B6).
  - §10.1: only the server applies a pending restore (A4).
  - §12: the heading rule (B10).
  - §15: launcher mode check (B9).
- **README.md:** mention that the scripts refuse to run while a hot restore is pending (A4).

### Done when

- [x] Every item A1–A6, B1–B10, C1 is implemented with its tests.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` all pass; results reported with counts.
- [x] Docs updated as listed.
- [x] Manual checklist, run against `./.data-dev` only:
  - [x] Trash a chapter, wait 15 s, restore it from the Trash dialog.
  - [x] Paste a deeply quoted email into a chapter, keep typing, reload: nothing lost.
  - [x] Close the tab while a save is failing (stop the dev server first): the browser asks before leaving.
  - [x] Paste a passage from Google Docs: only its bold words are bold.
  - [x] Reopen a book from the library after restarting the app: the last section opens.
  - [x] Delete every Codex category: they do not come back by themselves.
  - [x] Start `npm run dev` with `PORT=4317` and double-click `NovelStudio.command`: it refuses instead of opening the dev server.
  - [x] Import a Chinese TXT whose body contains `第二节课…` sentences: the preview shows only the real chapters.

---

## M10 — Interface language (English / 简体中文)

Make every piece of interface text switchable between English and Simplified Chinese (PRD §12.1). M10 changes **no stored data** and adds **no dependency**. It goes before M11, so the image interface is written in both languages from the start.

**Not in scope:** other languages; translating the user guide, CLI output, server logs or the cold backup `_readme`; translating or rewriting anything already stored in a book; right-to-left layout.

Work in group order. Several commits (`M10: …`) are fine; the milestone is accepted as a whole.

### Group A — Infrastructure

**A1. Locale type and dictionaries.**
- `src/shared/schemas/locale.ts`: `localeSchema = z.enum(['en', 'zh-CN'])`, type `Locale`, `DEFAULT_LOCALE = 'en'`.
- `src/client/i18n/`:
  - `en.ts` is the source of truth: a flat `as const` object of message keys (`'library.newBook'`, `'editor.status.saving'`, …).
  - `zh-CN.ts` is typed `Record<MessageKey, string>`, so a missing or extra key is a compile error.
  - Placeholders use `{name}` (e.g. `'trash.restoredTo': 'Restored to {parent}'`).
  - Plurals use `Intl.PluralRules`: keys ending `.one` / `.other`. Chinese fills both the same way.
- `index.ts` exports:
  - `t(key, params?)` and a `useT()` hook that re-renders on a locale change;
  - `formatNumber`, `formatDate`, `formatDateTime`, `formatWords(count)`, all using the current locale;
  - `apiErrorMessage(error)` (A4).
- No i18n library. Keep `t` small and tested.

**A2. Locale store and switch (I18N-02, I18N-08).**
- A Zustand store `stores/locale.ts`, persisted in `localStorage` under `novelstudio:locale`.
- First start: `navigator.language` beginning with `zh` → `zh-CN`, anything else → `en`. An unreadable stored value counts as unset.
- On change, set `document.documentElement.lang` and `document.title`.
- Settings page: a **Language · 语言** section (label always in both languages), with options `English` / `简体中文`, each in its own language.
- Switching must not remount the editor or touch savers. Test this (C2).

**A3. Lint guard (I18N-09).**
- In `eslint.config.js`, for `src/client/**/*.tsx`, use the core rule `no-restricted-syntax` to forbid:
  - `JSXText` containing a Latin letter or CJK character;
  - string literals in the JSX attributes `title`, `placeholder`, `aria-label`, `alt` and `label`.
- Exceptions (the product name `NovelStudio`, keyboard key names) need an `eslint-disable-next-line` comment with a reason.
- Strings built in `.ts` files and shown in the UI (notices, `confirm()` text, toasts) must also go through `t`; review them by hand, since lint cannot see them.

**A4. Error messages (I18N-04).**
- Add `src/shared/error-codes.ts`, listing every API error `code` the server can return. Use it on the server where practical.
- The client has an `errors.<CODE>` key for every code.
- `apiErrorMessage` translates by code. For an unknown code it falls back to the server's message.
- Messages that carry server-side details (e.g. a cold backup path, a validation detail) show the translated sentence plus the detail.

### Group B — Translate everything

**B1. Client text (I18N-01, I18N-03, I18N-07).** Move every string in `src/client/**` to the dictionaries. That covers pages, features, components, dialogs, notices, tooltips, aria labels and the save status. Replace bare `toLocaleString()` and `Intl.*(undefined, …)` with the locale-aware helpers. Names that belong to the app are translated at display time:
- section kinds in menus, section statuses;
- map template names and descriptions;
- foreshadow roles, statuses and warning texts (translate from the warning `kind` and its parameters; `shared/foreshadow.ts` keeps its English `message` as the fallback);
- highlight color names, theme names, `(untitled)`.

**B2. Text the app creates (I18N-06).**
- `src/shared/seed-text.ts` (pure data, both locales) holds:
  - default Codex categories and field **labels**, with field **keys** unchanged;
  - map template titles and node titles;
  - the default map title;
  - the copy suffix (`(copy)` / `（副本）`);
  - the *Front matter* title of a text import (`前言`);
  - the restored-book title suffix (` (restored YYYY-MM-DD)` / `（恢复于 YYYY-MM-DD）`).
- These endpoints take an optional `locale` (body field or multipart field; default `en`, invalid → `400 VALIDATION_ERROR`), and the client always sends the current one:
  - `POST /books` (Codex defaults, plus the numbering preset: `zh-CN` → the Chinese preset of NUM-04);
  - `POST /books/:id/codex/seed`;
  - `POST /import/text` commit (Codex defaults and the *Front matter* title; the preset stays the user's choice);
  - `POST /books/:id/maps`;
  - `POST /nodes/:id/duplicate`;
  - `POST /maps/:id/duplicate`;
  - `POST /import/cold-backup` (title suffix).
- `GET /books/:id/export` takes `lang` for `(untitled)`.
- The CLI scripts and `seed:dev` keep English.
- The "characters in this section" detection (CDX-07) already keys on the `aliases` field. Confirm that a Chinese-default book (category `人物`) is detected, and add a test.

**B3. Glossary.** Use these terms everywhere so the Chinese interface is consistent. Ask before changing one.

| English | 简体中文 | English | 简体中文 |
|---|---|---|---|
| Library | 书库 | Codex | 设定集 |
| Book | 作品 | Category / Entry / Field | 分类 / 条目 / 字段 |
| Manuscript | 正文 | Story map | 故事图 |
| Section | 章节 | Node / Edge | 节点 / 连线 |
| Volume / Part / Chapter / Scene | 卷 / 部 / 章 / 场景 | Timeline / Plot tree / Character arc | 时间线 / 情节树 / 人物弧光 |
| Synopsis | 梗概 | Foreshadowing / Thread | 伏笔 / 伏笔线 |
| Status: idea / draft / revising / done | 构思 / 草稿 / 修改中 / 完成 | Setup / Hint / Payoff | 埋设 / 暗示 / 回收 |
| Trash / Restore | 回收站 / 恢复 | planned / planted / paid off / abandoned | 计划中 / 已埋设 / 已回收 / 已放弃 |
| Snapshot | 快照 | Anchor | 锚点 |
| Hot backup / Cold backup | 热备份 / 冷备份 | Focus mode | 专注模式 |
| Saving… / Saved / Error | 正在保存… / 已保存 / 保存失败 | Find & replace | 查找和替换 |
| Word count / words | 字数 / 字 | Display settings | 显示设置 |
| Cover | 封面 | Import / Export | 导入 / 导出 |
| Image / Caption (M11) | 插图 / 图注 | Header image (M11) | 题图 |

Default Codex categories in Chinese: 人物, 地点, 时代与年表, 文化与习俗, 组织与势力, 生物与种族, 规则与概念, 其他.
- Character fields: 姓名, 别名, 身份, 年龄, 外貌, 背景, 性格, 目标与动机, 人物关系, 人物弧光, 备注.
- Other categories' fields: 描述, 备注.

### Group C — Tests

- **C1. Unit:**
  - `t` with placeholders, plurals and fallback;
  - every `en` key has a non-empty `zh-CN` value with the same set of `{placeholders}`;
  - `formatWords` in both locales;
  - first-start detection from `navigator.language`;
  - every code in `error-codes.ts` has both translations;
  - `seed-text.ts` has the same Codex field keys in both locales.
- **C2. E2E:**
  - Switch to 简体中文 in Settings. Library, workspace (all four views), the Settings page and a dialog show Chinese labels, `<html lang="zh-CN">`, no reload happens, and the choice survives a reload.
  - Type in a section, switch the language immediately, reload: the text is all there.
  - Create a book in Chinese: its Codex starts with `人物`, and a new chapter shows as `第一章`. Switch back to English: the same book still shows `人物` and `第一章`.
- **C3. API:**
  - `POST /books` with `locale: 'zh-CN'` creates Chinese categories and the Chinese preset;
  - without `locale`, the result is the same as today;
  - an invalid `locale` → `400`;
  - map and section duplicate suffixes in both locales;
  - export `lang=zh-CN` writes `（无标题）` for untitled sections.
- Existing tests keep passing. E2E tests that select by English text should run in English, either by setting the locale in a fixture or by relying on the English default.

### Docs to update in the same change

- **ARCHITECTURE.md:**
  - §2: an "Interface language" row (no library; typed dictionaries + `Intl`);
  - §3: `src/client/i18n/`, `shared/seed-text.ts`, `shared/error-codes.ts`;
  - §6: the `locale` / `lang` parameters;
  - a short "Interface language" subsection: the store, `lang` attribute, lint guard and the rule that stored data is never translated.
- **AGENTS.md** (Technical rules): "All interface text goes through `t()` with both `en` and `zh-CN` entries; never hardcode UI text; follow the glossary in ROADMAP M10."
- **README.md** and **USER_GUIDE.md**: one short paragraph on switching language.

### Done when

- [x] Every item A1–A4, B1–B3, C1–C3 is implemented.
- [x] `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` all pass; results reported with counts (789 unit/API tests, 77 E2E tests).
- [x] Docs updated as listed.
- [ ] Manual checklist, run against `./.data-dev` only:
  - [ ] Click through every view and dialog in 简体中文: no English left except the product name, user data and fixed formats.
  - [ ] Read the Chinese text for tone and terminology (the user reviews the wording).
  - [ ] Trigger a few errors (export to a missing folder, upload an SVG): the messages are in Chinese.
  - [ ] Dates in the library, snapshots and hot backup list use Chinese formatting.

---

## M11 — Images: illustrations and section header images

Images between paragraphs and a header image per section (PRD §5.2, §5.3). The single most important rule is **an image is always a line of its own**. Do not add text wrapping, inline images, alignment options or free resizing, even if Tiptap makes them easy. All new interface text goes through `t()` in both languages (M10).

**Not in scope:** image editing; images inside quotes, headings, Codex fields or map nodes; images from URLs; a gallery view; image notes (e.g. the AI prompt); orphan cleanup; EPUB/DOCX; changing cover, Codex or background uploads; a multi-file cold backup format.

Work in group order. Several commits (`M11: …`) are fine; the milestone is accepted as a whole.

### Group A — Images in the text

**A1. Content model.**
- `src/shared/schemas/content.ts` adds the node type `image`, with the attributes `assetId` (UUID, required), `size` (`small` | `medium` | `full`, default `medium`) and `caption` (string, at most 300 characters, default `''`).
- It has no `content`, `marks` or `text`, and it is only valid as a direct child of `doc`.
- No `src`, base64 or any other attribute is ever stored; content holds only the asset id.
- `normalizeContent` (shared, runs everywhere content is normalized today):
  - moves an `image` found inside a blockquote (or deeper) to just after the top-level block that contained it, in order;
  - drops unknown image attributes;
  - fills missing `size`/`caption` with the defaults;
  - truncates a caption over 300 characters.
- An image whose `assetId` is not a UUID cannot come from the editor, so it stays a validation error.
- An image whose asset does not exist **is valid** (IMG-07). Saves never check that an asset exists.

**A2. Editor node (IMG-01..05, IMG-13).**
- A custom Tiptap node in `features/editor/image-extension.ts`, rendered with `ReactNodeViewRenderer` from `@tiptap/react` (already a dependency; do **not** add `@tiptap/extension-image`).
- Atom, draggable, selectable, top level only. The document's content expression must allow it at the top level and the blockquote's must not.
- Rendering:
  - `<figure>` with the image, centered, its width set by `size` (Small ≈ 33%, Medium ≈ 66%, Full = 100% of the text column; `max-width` = natural width);
  - `<figcaption>` when the caption is set;
  - `loading="lazy"`, `decoding="async"`, and `alt` set to the caption;
  - URL `/assets/<bookId>/<assetId>`;
  - a failed load shows an **Image missing** placeholder of the same width, and the node stays.
- Selected image: a small bar with S / M / Full, **Caption** (inline input, `maxLength` 300), **Replace** (same dialog as insert; keeps size and caption) and **Remove**. Double-click opens a full-size overlay (Radix dialog; `Esc` closes).
- Toolbar **Image** button: opens the insert dialog (A4). Insertion happens at the cursor. Inside a paragraph, the paragraph is split, so the image never shares a line. If the cursor is in a quote, the image goes after the quote.
- Clipboard HTML of an image is `<figure data-ns-image data-asset-id data-book-id data-size>…`. `parseHTML` accepts **only** that form.

**A3. Pasting and dropping (IMG-01, IMG-09, IMG-10).**
- `handlePaste` / `handleDrop`: `image/*` files are optimized (A5), uploaded with `POST /books/:id/assets`, and inserted at the cursor or drop point once the upload succeeds.
- Mapping the position: map the insert position through the transactions that happen during the upload, and insert at the mapped position.
- No placeholder node is ever stored. While uploading, show the notice "Uploading image…".
- If the upload fails, show the translated error (e.g. `415`, `413`) and insert nothing.
- `paste.ts` removes every foreign `<img>`/`<picture>` (anything that is not our own `figure[data-ns-image]`). If it removed any, show the IMG-09 notice. Nothing is ever fetched.
- *Should, IMG-10:* if a pasted image's `data-book-id` is another book, call a new `POST /books/:id/assets/copy` `{ sourceBookId, assetId }` → `201 { asset }`. The server copies the file into this book (same checks as an upload), and the client then sets the new `assetId`. If the copy fails, remove that image from the pasted content and show a notice.

**A4. Book images and the insert dialog (IMG-06, IMG-08, IMG-14).**
- New `GET /books/:id/assets` → `{ assets: [{ id, fileName, mime, bytes, url, createdAt }], totalBytes }` (newest first; readable for a trashed book).
- One `ImagePickerDialog`, used for insert, replace and header images, with:
  - an **Upload** area with the **Keep original** checkbox, remembered in `localStorage` (`novelstudio:keepOriginalImages`);
  - a thumbnail grid of the book's images;
  - the book's total image size, with a warning above 200 MB.

**A5. Optimization (IMG-06).**
- Pure decision helpers go in `src/shared/image-sizing.ts`: `needsOptimizing({ width, height, bytes, mime, animated })` and `targetSize(width, height, maxEdge = 2400)`. Both are unit-tested.
- The browser part goes in `features/editor/image-optimize.ts`:
  - decode with `createImageBitmap` (EXIF orientation applied);
  - draw to a canvas at the target size;
  - encode with `toBlob('image/webp', 0.85)`.
- Upload the original unchanged in any of these cases:
  - the image is a GIF;
  - the browser does not return WebP;
  - the result is not smaller than the original;
  - anything throws.
- The file name keeps its base name with the new extension.

**A6. Plain text, counts, export (IMG-11).**
- `docToPlainText` skips `image` nodes, so `plain_text`, `word_count`, find, find & replace and foreshadow anchors are unchanged.
- `manuscript-export.ts` writes `[Image: <caption>]` / `[Image]` as its own block. The text is localized through the `lang` parameter from M10 (`[插图：<图注>]` / `[插图]`), and escaped in Markdown.

**A7. Show images (IMG-12).**
- Add `showImages` (boolean, default `true`) to `settings.display`, with a checkbox in Display settings. Older settings without the key read as `true`.
- When off, images and the header image render as a one-line placeholder with the caption.
- It is part of the book settings, so it is already in the cold backup.

### Group B — Section header images (IMG-20..23)

**B1. Data.**
- Migration `005_section_header_image.sql`: `ALTER TABLE nodes ADD COLUMN header_asset_id TEXT REFERENCES assets(id);`. It is a new file; never edit an earlier migration.
- `GET /nodes/:id` returns `headerAssetId` and `headerImageUrl`. The tree endpoint does not need it.
- `PATCH /nodes/:id` accepts `headerAssetId`: an asset of the same book, or `null`. Anything else is `400 INVALID_IMAGE`; a trashed book is `409 BOOK_TRASHED`.
- Duplicate copies `header_asset_id`. Trash and restore leave it as it is.

**B2. UI.**
- The header image renders above the title `h2` in `EditorPanel`, inside the text column:
  - the whole image is visible (`object-fit: contain`), centered;
  - `max-height: 40vh`;
  - a missing file shows a slim **Image missing** bar.
- Hovering the title area shows a quiet **Add header image** button, or **Replace / Remove** when one is set.
- The details panel has the same controls and a small preview.
- Header images go through the picker (A4) and the optimization (A5).

### Group C — Asset safety and backups

**C1. Never delete an image that is still used (IMG-07, IMG-22).**
- Extend `isAssetInUse` (`repos/`) so it also returns true when the asset is:
  - a node's `header_asset_id`;
  - referenced by the `content` of any node of the book, **trashed ones included**;
  - referenced by the `content` of any snapshot of those nodes.
- A narrowing `instr(content, ?)` search followed by a JSON check is fine at this scale. Keep the SQL in `repos/`.
- Removing an image from the text deletes nothing.
- Replacing or removing a header image deletes the old file only if `isAssetInUse` is false, which is the existing cover rule.

**C2. Cold backup (COLD-09).**
- Export:
  - `Section` and `TrashedSection` gain `headerAssetId` (`string | null`; a missing key on restore means `null`);
  - `content` carries `image` nodes unchanged;
  - `formatVersion` stays `1`, per the versioning rules (an optional key with a default).
- Restore:
  - remap `image.attrs.assetId` in section **and** snapshot content, and `headerAssetId`, through the same ID map as the cover (alongside the `foreshadowAnchor` remap);
  - an image node whose asset is not in the file is **kept** (it shows as missing) with one warning per section;
  - a missing header asset becomes `null`, with a warning.
- Size guard (IMG-14):
  - before serializing, if the book's image bytes exceed `COLD_BACKUP_MAX_IMAGE_BYTES` (300 MB; a constant that tests can lower), fail with `COLD_BACKUP_TOO_LARGE`, write nothing, and name the book and its image total;
  - also turn a `RangeError` from `JSON.stringify`/`JSON.parse` into this error (restore: `INVALID_BACKUP` with a clear message) instead of a crash;
  - auto daily cold backup reports the failure like any other.
- Update the `_readme` text (COLD_BACKUP_FORMAT §6) with: "Sections refer to images by 'assetId' ('image' nodes in 'content') and 'headerAssetId'." Update its test.

### Group D — Tests

- **Unit:**
  - the schema accepts a top-level image and rejects one inside a paragraph;
  - `normalizeContent` lifts an image out of nested quotes (order kept), drops unknown attributes, truncates long captions, and the output passes `contentSchema`;
  - `docToPlainText`/word count are identical with and without images;
  - export placeholder lines in both languages;
  - `needsOptimizing`/`targetSize` tables;
  - picker size formatting.
- **API:**
  - `PUT /nodes/:id/content` with an image of a non-existent asset → `200`;
  - an image inside a quote → `200` and stored lifted out;
  - `GET /books/:id/assets` → the list and the total;
  - `PATCH` `headerAssetId`: valid, another book's asset → `400`, `null` → removed;
  - replacing a header deletes the old file only when it is unused: keep it when the asset is in some section's text, a trashed section's text or a snapshot;
  - duplicate copies the header;
  - asset copy between books (if IMG-10 is done);
  - `COLD_BACKUP_TOO_LARGE` with a lowered limit writes nothing.
- **Cold backup:**
  - the round trip with images in text, snapshots and headers is identical;
  - restore with an ID collision remaps every `assetId` and `headerAssetId`;
  - a missing asset keeps the node and warns.
- **E2E** (images generated in the test as small made-up PNGs; no real pictures in fixtures):
  - insert via the toolbar mid-paragraph: two paragraphs with the image between; set Small, add a caption, reload → unchanged;
  - paste an image file → inserted on its own line;
  - paste HTML with an `<img src="https://…">`: no request leaves the page (Playwright request listener), the image is left out, and the notice is shown;
  - set a header image → above the title; reload → still there;
  - remove an image, undo → it is back; remove it, restore the previous snapshot → it shows (the file was not deleted);
  - Show images off → placeholders.
- **Manual:**
  - a 4,000 px PNG becomes a ≤ 2,400 px WebP;
  - **Keep original** uploads the PNG unchanged.

### Docs to update in the same change

- **ARCHITECTURE.md:**
  - §2 Editor row: the custom node `image` (no new dependency);
  - §5: `header_asset_id`;
  - §6: `GET /books/:id/assets`, `POST /books/:id/assets/copy`, the `PATCH /nodes/:id` and `GET /nodes/:id` additions;
  - §8: an "Images" paragraph (model, normalization, paste and drop, optimization, missing images, show images);
  - §10.2: the restore remap and size guard;
  - §13: pasted images are never fetched.
- **COLD_BACKUP_FORMAT.md:**
  - §4.2: `headerAssetId` and the `image` node;
  - §5 rule 4: the new references;
  - §6: the `_readme` line;
  - §7: optionally, a `jq` recipe that lists images per section.
- **USER_GUIDE.md:** inserting images, header images, Keep original, Show images.

### Done when

- [ ] Every item in groups A–D is implemented (IMG-10 and IMG-13 may be deferred if agreed with the user).
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` all pass; results reported with counts.
- [ ] Docs updated as listed.
- [ ] PRD §13 scenarios 17–19 pass.
- [ ] Manual checklist, run against `./.data-dev` only:
  - [ ] Insert three AI-style images in a chapter at different widths: the text never wraps beside them, in light, dark and sepia themes and in focus mode.
  - [ ] Drag an image to another place in the section: it always lands between paragraphs.
  - [ ] Switching to a chapter with several large images stays smooth (lazy loading).
  - [ ] Export the book to Markdown: image lines are in place; cold backup export and `verify:cold` succeed.

---

## Later (not scheduled)

Multi-select drag · swimlane timeline view · codex field types & relationship graph · DOCX/EPUB (with images) · writing goals · Electron wrapper · per-heading toggles in the import preview · cleanup of orphaned image uploads (a cover uploaded but never attached, e.g. when saving the book fails; images removed from the text, once no snapshot uses them) · a cold backup format for books with more than ~300 MB of images · image notes (e.g. the prompt that generated an illustration) · a gallery view of a book's images · a Chinese user guide · more interface languages.
