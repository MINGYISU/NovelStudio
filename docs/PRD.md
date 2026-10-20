# NovelStudio — Product Requirements

| | |
|---|---|
| Version | 0.2 (draft, pre-implementation) |
| Platform | Local-first web app: a small Node server + browser UI on `127.0.0.1` |
| User | One novelist (the author of this repo), on macOS |
| Cost | Free. No accounts, no cloud, no paid libraries or services |

Related documents: [ARCHITECTURE.md](./ARCHITECTURE.md) (how), [ROADMAP.md](./ROADMAP.md) (in what order), [COLD_BACKUP_FORMAT.md](./COLD_BACKUP_FORMAT.md) (last-resort JSON format).

Requirement IDs (e.g. `TREE-03`) are referenced by tests and commit messages. Priorities: **Must** = required for the milestone that introduces it; **Should** = same milestone if cheap, otherwise next; **Later** = explicitly deferred.

---

## 1. Product overview

NovelStudio is a personal writing app for long-form fiction. It combines:

1. A clean rich-text editor for writing chapters.
2. A hierarchical table of contents with **free drag-and-drop reordering** and automatic renumbering (the reason this app exists).
3. **Story maps**: node-and-edge diagrams for plot structure, timelines and character arcs.
4. A **foreshadowing tracker** that links setups to payoffs and warns when reordering breaks them.
5. A **Codex**: character cards and worldbuilding entries with customizable fields.
6. Layered local data protection, ending in a human-readable **cold backup** JSON file.

### Principles

- **Writing first.** The editor stays clean; planning tools never get in the way of typing.
- **Stable identity.** Every item has a permanent ID. Titles, numbers and positions can change; links never break because of it.
- **Reading order ≠ story chronology.** Moving a chapter changes reading order only. Story maps hold chronology separately.
- **The user owns the data.** Everything lives in local files and can be exported to a format readable without this app.
- **Small and dependable over big.** Every feature must justify itself in daily writing.

---

## 2. Library (home page)

| ID | Pri | Requirement |
|---|---|---|
| LIB-01 | Must | Grid of book cards: cover image, title, author (optional), last-modified date, total word count. |
| LIB-02 | Must | Clicking a card opens the book workspace. |
| LIB-03 | Must | **New** button → *Create blank* (enter title) or *Import* (see §9). |
| LIB-04 | Must | Books without a cover get a generated cover (title on a color derived from the book ID). |
| LIB-05 | Must | Card menu: edit metadata (title, author, description, cover), export, move to trash. |
| LIB-06 | Must | Trashed books are restorable from a *Trash* view; permanent deletion needs typed confirmation of the title. |
| LIB-07 | Should | Sort by last modified (default) or title. |
| LIB-08 | Should | Each card shows when its last cold backup was made; amber if older than the reminder threshold (default 7 days) or never (see §11.4). |

---

## 3. Book workspace

Layout:

- **Top bar**: back to library, book title, view switcher, save status (`Saving…` / `Saved` / `Error — click for details`), settings.
- **Left sidebar**: manuscript table of contents (§4). Resizable and collapsible.
- **Main panel**: the active view.
- **Right panel** (optional, collapsible): details for the selected section — synopsis, status, word count, linked foreshadows, linked Codex entries.

Views: **Manuscript** (default), **Story Maps**, **Foreshadowing**, **Codex**.

| ID | Pri | Requirement |
|---|---|---|
| WS-01 | Must | The URL reflects the open book, view and item, so reload returns to the same place. |
| WS-02 | Must | The last opened section per book is remembered. |
| WS-03 | Should | Focus mode (`Cmd+Shift+F`) hides sidebar, panels and top bar. |

---

## 4. Manuscript structure (Critical)

### 4.1 Section types

Four kinds, ranked: **Volume (0) > Part (1) > Chapter (2) > Scene (3)**.

| ID | Pri | Requirement |
|---|---|---|
| TREE-01 | Must | A section may only be placed under a section of a **strictly higher rank**, or at the book root. Levels may be skipped (chapters directly in the root, scenes directly in a volume, etc.). |
| TREE-02 | Must | **Every section can hold text.** Volumes and parts typically hold a short intro or nothing; chapters hold prose; scenes are optional subdivisions of chapters. |
| TREE-03 | Must | Each section has a `numbered` flag. Unnumbered sections (Prologue, Interlude, Epilogue, Afterword) never consume a number. |
| TREE-04 | Must | Labels and number formats are configurable per book and per kind (§4.4). |
| TREE-05 | Must | Sidebar shows the hierarchy with indentation per level, expand/collapse arrows on sections that have children, and the computed display title. |
| TREE-06 | Must | Create (as sibling after / as child), rename inline (double-click or `F2`), duplicate (with subtree), and move to trash. |
| TREE-07 | Must | Expand/collapse state is remembered per book. |
| TREE-08 | Must | Trash: trashed sections (with their subtree) disappear from the tree and numbering, appear in the book's Trash list, and can be restored. Restore puts the section back at the end of its original parent, or at the root if that parent no longer exists. |
| TREE-09 | Should | Each section has a status (`idea`, `draft`, `revising`, `done`) shown as a small dot. |
| TREE-10 | Should | Each section has a synopsis (plain text), shown in the right panel and as a tooltip. |
| TREE-11 | Should | Sidebar footer: total words; per-row word count on hover. |

### 4.2 Reordering (the defining feature)

| ID | Pri | Requirement |
|---|---|---|
| MOVE-01 | Must | Drag any section to any valid position: before a sibling, after a sibling, or inside a compatible parent. |
| MOVE-02 | Must | A drop indicator line shows exactly where the item will land; invalid targets show no indicator and the drop is refused. |
| MOVE-03 | Must | Moving a section moves its whole subtree. |
| MOVE-04 | Must | Sections can move between parents (e.g. a chapter from Part I into Part II). |
| MOVE-05 | Must | Invalid moves are rejected on both client and server: into itself, into its own descendant, or breaking the rank rule (TREE-01). |
| MOVE-06 | Must | Display numbers update immediately after a drop. Example: dragging *Chapter 4* above *Chapter 3* makes it *Chapter 3*, and the old *Chapter 3* becomes *Chapter 4*. |
| MOVE-07 | Must | IDs, titles, content and all references (maps, foreshadows) are untouched by a move. |
| MOVE-08 | Must | Moves are persisted atomically. After an app restart the order is identical. If the save fails, the tree reverts and an error is shown. |
| MOVE-09 | Must | Keyboard moves on the selected section: `Alt+↑` / `Alt+↓` move among siblings; `Tab` indents (becomes last child of the previous sibling, if valid); `Shift+Tab` outdents (becomes the next sibling of its parent). |
| MOVE-10 | Should | Hovering over a collapsed parent during a drag auto-expands it after ~600 ms. |
| MOVE-11 | Should | `Cmd+Z` in the sidebar undoes the last structural move (single-level undo is enough). |
| MOVE-12 | Later | Multi-select drag of several sections at once. |

### 4.3 Numbering rules

- Numbers are **computed, never stored** in titles or in the database.
- Display title = `<formatted number>` + separator + `<title>`, e.g. `Chapter 3 — Reunion`, `第三章 重逢`. If a section is unnumbered, only the title is shown.
- Counting walks the tree in reading order (depth-first, pre-order), skipping trashed and unnumbered sections.
- Each kind has a **restart scope**: the counter resets whenever a new section of that scope starts.

Defaults:

| Kind | Default format | Restart within |
|---|---|---|
| Volume | `Volume {n:roman}` | book |
| Part | `Part {n}` | book |
| Chapter | `Chapter {n}` | book (continuous through the whole novel) |
| Scene | `Scene {n}`, and scenes are unnumbered by default | chapter |

### 4.4 Per-book structure settings

| ID | Pri | Requirement |
|---|---|---|
| NUM-01 | Must | Per kind: label (e.g. `卷`, `章`), number format, restart scope, default `numbered` for new sections. |
| NUM-02 | Must | Format tokens: `{n}` (1, 2, 3), `{n:roman}` (I, II), `{n:roman-lower}` (i, ii), `{n:cn}` (一, 二 … 十一 … 一百零一), `{n:alpha}` (A, B). |
| NUM-03 | Must | Separator between number and title is configurable (default ` — `; a single space for formats like `第{n:cn}章`). |
| NUM-04 | Should | Presets: *English* (defaults above) and *Chinese* (`第{n:cn}卷`, `第{n:cn}部`, `第{n:cn}章`, scenes unnumbered). |

---

## 5. Editor

| ID | Pri | Requirement |
|---|---|---|
| ED-01 | Must | Selecting a section opens its content in the rich-text editor. Empty sections show an empty editor with a placeholder. |
| ED-02 | Must | Formatting (stored in content): bold, italic, underline, strikethrough, highlight (several colors), headings (2 levels), blockquote, text alignment, scene break (horizontal rule). Nothing else. |
| ED-03 | Must | Undo/redo (`Cmd+Z` / `Cmd+Shift+Z`) within the open section. History resets when switching sections. |
| ED-04 | Must | Cut/copy/paste. Pasting from Word or web pages keeps only formatting allowed by ED-02; fonts, sizes and colors are stripped. `Cmd+Shift+V` pastes plain text. |
| ED-05 | Must | Autosave ~1 s after typing stops, and immediately on section switch, view switch, tab hide, and page unload. Save status shown in the top bar (§3). |
| ED-06 | Must | Word count for the current section and the whole book. CJK characters count one each; other text counts by words. Selection count when text is selected. |
| ED-07 | Must | A stale save (e.g. from a second browser tab) is rejected rather than overwriting newer text; the user is told to reload. |
| ED-08 | Must | Find within the current section (`Cmd+F`). |
| ED-09 | Should | Find & replace across the whole book (e.g. rename a character). Shows matches per section before replacing; snapshots every affected section first. Matches do not span formatting boundaries (documented limitation). |
| ED-10 | Should | Section snapshots: browse previous versions of a section with timestamps and restore one (restoring snapshots the current text first). |
| ED-11 | Later | Typewriter scrolling, writing goals/streaks, spell-check settings. |

### 5.1 Display settings (per book, not stored in the text)

Font family, font size, line height, paragraph spacing, first-line indent (e.g. `2em` for Chinese), editor width, theme (light / dark / sepia), background color, optional background image with opacity.

| ID | Pri | Requirement |
|---|---|---|
| DISP-01 | Must | Font family, size, line height, first-line indent, editor width, light/dark theme. |
| DISP-02 | Should | Background color/image, sepia theme, paragraph spacing. |
| DISP-03 | Must | Only system fonts and fonts bundled with the app are offered. No network font loading. |

---

## 6. Story maps

Multiple diagrams per book. Each is a free graph of nodes and directed edges; a tree is just a graph used in a tree shape.

| ID | Pri | Requirement |
|---|---|---|
| MAP-01 | Must | List of maps per book; create, rename, duplicate, delete. |
| MAP-02 | Must | Templates when creating: *Blank*, *Timeline* (left-to-right chain of stages), *Plot tree* (top-down tree), *Character arc* (start state → change points → end state). Templates are only starting layouts. |
| MAP-03 | Must | Node fields: title, description, color, optional `storyTime` (free text, e.g. "Spring 1923", "Year 3, Day 12"), links. |
| MAP-04 | Must | Edge fields: source, target, optional label. Edges are directed. |
| MAP-05 | Must | Add/delete/edit nodes and edges; drag nodes; pan/zoom; fit view; minimap. |
| MAP-06 | Must | **Auto-layout** button: arranges the graph as a tree/flow (top-down or left-right). |
| MAP-07 | Must | Node links to manuscript sections and Codex entries. Clicking a section link opens that section in the Manuscript view. Links show the **current** display title. |
| MAP-08 | Must | Positions, viewport and all data persist. |
| MAP-09 | Should | Creating a child node via a `+` handle on a node (fast tree building). |
| MAP-10 | Later | Swimlane timeline view: one row per character/plotline, nodes placed by `storyTime`. |

---

## 7. Foreshadowing tracker

A **thread** is one planted idea. It has **occurrences** in sections, each with a role: **Setup**, **Hint**, or **Payoff**.

| ID | Pri | Requirement |
|---|---|---|
| FS-01 | Must | Thread fields: title, description, status (`planned`, `planted`, `paid_off`, `abandoned`), color, notes. |
| FS-02 | Must | Occurrence fields: section, role, optional excerpt (quoted text), note. A thread may have any number of each role. |
| FS-03 | Must | Thread list view: each thread with its occurrences listed **in current reading order**, each showing the section's current display title; click to open the section. |
| FS-04 | Must | **Matrix view**: rows = threads, columns = numbered sections in reading order; cells show ● setup, ◐ hint, ★ payoff. Click a cell to jump. |
| FS-05 | Must | **Automatic warnings**, recomputed after every edit or move: (a) payoff placed before the first setup in reading order; (b) payoff with no setup; (c) setup with no payoff while status is not `abandoned`; (d) thread dormant for more than N chapters (default 10, configurable); (e) occurrence pointing to a trashed or missing section. |
| FS-06 | Must | Warnings appear in the Foreshadowing view and as a badge on affected sections in the sidebar. A move that creates a new warning shows a brief non-blocking toast. |
| FS-07 | Must | The right panel of a section lists the threads that occur in it. |
| FS-08 | Should | **In-text anchors**: select text in the editor → *Mark as setup/hint/payoff* → pick or create a thread. The anchor is stored inside the section's content, so it survives edits and moves. If the anchored text is deleted, the occurrence shows *anchor missing* but is kept. If the anchored text is cut and pasted into another section, the occurrence follows it. |

---

## 8. Codex (characters and worldbuilding)

One module for both. A **category** has a field template; an **entry** has a title, summary, image, and an ordered list of fields.

| ID | Pri | Requirement |
|---|---|---|
| CDX-01 | Must | Default categories for new books: **Characters**, Locations, Era & Timeline, Culture & Traditions, Organizations, Creatures & Species, Rules & Concepts, Other. Categories can be added, renamed, reordered, deleted (only when empty). |
| CDX-02 | Must | Characters' default fields: Name, Aliases, Role, Age, Appearance, Background, Personality, Goals & Motivation, Relationships, Arc notes, Notes. |
| CDX-03 | Must | Other categories' default fields: Description, Notes. |
| CDX-04 | Must | Each entry can add, rename, reorder and remove its own fields. Field types: short text, long text. Editing a category template affects new entries only. |
| CDX-05 | Must | Card grid per category with image, title, summary; search across all entries. |
| CDX-06 | Must | Optional image per entry (portrait, map, emblem). |
| CDX-07 | Should | Entries can be linked from map nodes and from section details ("characters in this chapter"). |
| CDX-08 | Later | More field types (date, select, entry link), relationship graph generated from links. |

---

## 9. Import

| ID | Pri | Requirement |
|---|---|---|
| IMP-01 | Must | Import a **cold backup / project file** (`.novelstudio.json`, §11.4) as a new book. |
| IMP-02 | Must | Import TXT or Markdown as a new book. Chapter detection splits on headings such as `第十二章 …`, `Chapter 12 …`, `CHAPTER XII`, Markdown `#`/`##`. A preview shows the detected sections before confirming; the user can turn detection off (single section). |
| IMP-03 | Must | A failed or cancelled import changes nothing. |
| IMP-04 | Later | DOCX import. |

---

## 10. Export

| ID | Pri | Requirement |
|---|---|---|
| EXP-01 | Must | Export manuscript as Markdown or TXT: sections in reading order with display titles; trashed sections excluded. |
| EXP-02 | Must | Export the full project as a cold backup file (§11.4). This is the **only** native project format. |
| EXP-03 | Later | DOCX / EPUB export. |

---

## 11. Data storage and protection (Critical)

### 11.1 Storage

| ID | Pri | Requirement |
|---|---|---|
| DATA-01 | Must | Fully offline. No login, no network calls at runtime, no telemetry. |
| DATA-02 | Must | One SQLite database file plus an `assets/` folder, in the **data directory**: `~/Library/Application Support/NovelStudio/` by default, overridable with `NOVEL_DATA_DIR`. The data directory is never inside the source code folder. |
| DATA-03 | Must | Development and tests never use the real data directory (see [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-data-directory-and-environments)). |
| DATA-04 | Must | Every operation that changes multiple rows runs in one transaction. |
| DATA-05 | Must | Schema changes use versioned, forward-only migrations. Startup with a newer-than-known schema refuses to run rather than damaging data. |

### 11.2 Protection layers

| Layer | What | When | Where | Protects against |
|---|---|---|---|---|
| 1. Autosave | Live database (SQLite WAL) | ~1 s after typing | data dir | Closing the tab, crashes |
| 2. Snapshots | Previous versions of each section | On first edit after opening; then at most every 10 min while editing; before replace/restore | database | "I deleted a paragraph yesterday" |
| 3. Hot backups | Full copy of the database | On server start and hourly if anything changed; keep last 20 | `<data dir>/backups/` | Bad migration, bug corrupting rows |
| 4. **Cold backup** | Self-contained human-readable JSON per book | Manual (+ optional daily) | **User-chosen folder**, ideally another disk or a synced folder | Corrupt or lost database, lost data dir, the app itself breaking |

### 11.3 Snapshots and hot backups

| ID | Pri | Requirement |
|---|---|---|
| SNAP-01 | Must | Snapshots per §11.2; keep the newest 50 per section. |
| HOT-01 | Must | Hot backups use SQLite `VACUUM INTO` (consistent copy while running), named `novelstudio-YYYYMMDD-HHmmss.db`; keep newest 20. |
| HOT-02 | Should | Settings → *Backups* lists hot backups and can restore one (current database is hot-backed-up first; restart required). |

### 11.4 Cold backup ("last line of defense")

A cold backup is a **plain JSON file** containing everything needed to rebuild one book, with no dependency on SQLite, the app's code, or the data directory. It is deliberately not optimized for size or speed. Full format: [COLD_BACKUP_FORMAT.md](./COLD_BACKUP_FORMAT.md).

| ID | Pri | Requirement |
|---|---|---|
| COLD-01 | Must | **Location**: the user sets a cold backup folder in Settings (absolute path; text field with *Validate*, plus a macOS *Choose…* folder picker). The server checks it exists (or can be created), is writable, and is **not inside the data directory or the source folder**. Recommended: an external drive, iCloud Drive, or Dropbox folder. The location is stored in `config.json` in the data directory, outside the database. |
| COLD-02 | Must | **Export this book** (workspace menu, library card menu) and **Export all books** (library menu). One JSON file per book, inside a per-book subfolder of the chosen location. A one-off *Export to…* path can be given instead of the saved location. |
| COLD-03 | Must | **Contents**: book metadata and settings; the full manuscript tree in reading order, each section with its rich content **and** a plain-text copy and its display title; trash; Codex; story maps; foreshadow threads and occurrences; all images embedded as base64 with SHA-256 checksums. Snapshots optional (off by default). |
| COLD-04 | Must | **Safe writing**: data read in a single read transaction (consistent), validated against the format schema, written to a temp file, flushed, then atomically renamed. A `.sha256` sidecar is written (verifiable with `shasum -a 256 -c`). The written file is re-read and verified (parse + counts + checksum) before reporting success. On failure nothing partial remains and existing backups are untouched. |
| COLD-05 | Must | **Never silently redirected**: if the location is unavailable (e.g. drive unplugged), the export fails with a clear message. |
| COLD-06 | Must | **Retention**: never deletes old cold backups by default. Optional *keep newest N per book* setting. |
| COLD-07 | Must | **Restore**: import as a new book from the library (IMP-01), and a command-line restore (`npm run restore:cold -- <file>`) that works even if the UI does not. If the book's IDs already exist, all IDs are regenerated and every reference remapped. Checksum mismatches warn but allow continuing. |
| COLD-08 | Must | **Readable without the app**: every section has `plainText` and `displayTitle`; the file begins with a `_readme` field explaining the structure. |
| COLD-09 | Must | Every new kind of persistent data added to the app is added to the cold backup export, restore and round-trip test in the same milestone. |
| COLD-10 | Should | Reminder badge when a book's last cold backup is older than N days (default 7) or missing (LIB-08). |
| COLD-11 | Should | Optional automatic cold backup: once per day on first app start, for books changed since their last cold backup. Off by default. |

---

## 12. Non-functional requirements

- **Performance**: switching sections < 200 ms for a 20,000-character chapter; drag feedback at 60 fps for 500 sections; maps usable at 300 nodes.
- **Reliability**: no data loss in normal navigation; failed saves always surfaced; no invalid tree states in the database (checked by an invariant function in tests).
- **Usability**: desktop layouts from 1280 px wide; keyboard shortcuts for common actions; consistent save behavior everywhere.
- **Security**: server binds to `127.0.0.1` only; rejects requests whose `Host`/`Origin` is not the app's own; all request bodies validated; imported files and pasted HTML treated as untrusted; SVG uploads rejected; image uploads limited to 20 MB.
- **Language**: UI in English for v1; content fully supports CJK text.

---

## 13. Acceptance scenarios

1. Create two books; both appear in the library after a restart.
2. Create volumes, parts, chapters and scenes; collapse and expand them.
3. Drag Chapter 4 above Chapter 3 → numbers swap, contents unchanged, persists after restart.
4. Move a chapter from Part I into Part II → content intact; numbering continuous across the book.
5. Move a whole Part → all its chapters move with it.
6. Try dropping a Part into its own chapter, or a Volume under a Chapter → refused.
7. Mark a chapter unnumbered (Prologue) → following chapters renumber.
8. Switch to the Chinese preset → titles display as `第三章 …`.
9. Type, switch chapters immediately, reload → nothing lost.
10. Create a story map from the *Plot tree* template, link a node to a chapter, click the link → that chapter opens; rename/move the chapter → link shows the new display title.
11. Create a foreshadow thread with a setup in Ch2 and payoff in Ch8; drag Ch8 above Ch2 → warning appears.
12. Create a character with a custom field; restart; field is intact.
13. Set a cold backup folder, export a book, delete the database file, run `npm run restore:cold` on the backup → the book is fully restored, including images, maps, foreshadows and Codex.
14. Unplug or rename the cold backup folder and export → clear error, nothing written elsewhere.
15. Import a TXT with `第一章` … `第五章` headings → preview shows five chapters; confirm creates them.

---

## 14. Out of scope for v1

Accounts, cloud sync, collaboration, mobile apps, AI writing features, publishing integrations, typesetting/print layout, DOCX/EPUB, signed or notarized macOS app bundles.

## 15. Decisions log

| Decision | Choice | Reason |
|---|---|---|
| Scenes | Optional fourth tree level (not only scene breaks inside a chapter) | Lets scenes be dragged between chapters; scene breaks (`***`) still exist inside text. |
| Numbering | Continuous through the book by default, configurable per kind | Matches most serialized and print novels. |
| Fonts | Display settings per book, not stored in text | Keeps the manuscript clean; exports stay consistent. |
| Characters vs. worldbuilding | One Codex module | Same data shape; half the code. |
| Native project format | The cold backup JSON | One format to maintain, readable without the app. |
