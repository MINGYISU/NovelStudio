# NovelStudio — Roadmap

Build one milestone at a time. Each milestone fits one AI coding session, ends with all checks green, a manual check by the user, and a commit. Do not start the next milestone until the current one is accepted.

Specs: [PRD.md](./PRD.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [COLD_BACKUP_FORMAT.md](./COLD_BACKUP_FORMAT.md) · Agent rules: [AGENTS.md](../AGENTS.md)

| # | Milestone | Key requirement IDs | Status |
|---|---|---|---|
| M0 | Skeleton & safety | DATA-01..05, HOT-01 | ☑ |
| M1 | Library | LIB-01..07 | ☑ |
| M2 | Tree logic & API (no UI) | TREE-01..03/08, MOVE-03..08, NUM-01..03 | ☑ |
| M3 | Sidebar with drag-and-drop | TREE-05..07/09..11, MOVE-01..11, NUM-04 | ☐ |
| M4 | Editor, autosave, **cold backup** | ED-01..08/10, DISP-01, SNAP-01, COLD-01..10, IMP-01, EXP-02 | ☐ |
| M5 | Codex | CDX-01..07 | ☐ |
| M6 | Story maps | MAP-01..09 | ☐ |
| M7 | Foreshadowing | FS-01..07 | ☐ |
| M7b | In-text foreshadow anchors | FS-08 | ☐ |
| M8 | Polish, import/export | WS-03, ED-09, DISP-02, HOT-02, IMP-02/03, EXP-01, COLD-11 | ☐ |

**From M4 on, the app is usable for real writing.** Before you write real chapters in it, make sure a cold backup folder is set and one export has succeeded.

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
- [ ] E2E: drag Ch4 above Ch3 → labels swap → reload → still swapped.
- [ ] E2E: drag a Part into its own Chapter → refused, nothing changes.
- [ ] Manual: moving feels immediate with the seeded sample book (~200 sections).

## M4 — Editor, autosave, cold backup

**Build**
- Tiptap editor with ED-02 formatting toolbar, find in section, paste cleaning, word counts (section/book/selection), display settings (DISP-01).
- Autosave hook with flush rules, revision checks (409 handling), save status in the top bar.
- Snapshots + snapshot browser/restore (ED-10).
- **Cold backup**: settings page (path field, Validate, Choose… picker), export this book / all books, verify, retention option, reminder badges, CLI `backup:cold`, `restore:cold`, `verify:cold`, import from library.

**Done when**
- [ ] E2E: type, switch section within 200 ms, reload → text intact.
- [ ] Two tabs editing the same section → the stale one shows "Changed elsewhere".
- [ ] Round-trip test: export → restore into empty data dir → export → identical (except allowed fields).
- [ ] Restore test with ID collision remaps all references.
- [ ] Export to a missing folder fails with `COLD_BACKUP_LOCATION_UNAVAILABLE` and writes nothing anywhere.
- [ ] Manual: `shasum -a 256 -c` succeeds on an exported file; the `jq` recipe in COLD_BACKUP_FORMAT §7 prints the manuscript.

## M5 — Codex

**Build**: categories with templates (defaults per PRD §8), entry cards, entry editor with add/rename/reorder/remove fields, images, search, "characters in this section" in the right panel. Extend cold backup + round-trip test.

**Done when**: custom field persists after restart; category with entries cannot be deleted; round-trip test covers codex.

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

---

## Later (not scheduled)

Multi-select drag · swimlane timeline view · codex field types & relationship graph · DOCX/EPUB · writing goals · Electron wrapper.
