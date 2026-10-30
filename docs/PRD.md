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
7. **Illustrations**: images placed between paragraphs and a header image per section, always on a line of their own (§5.2, §5.3).
8. An interface in **English or Simplified Chinese**, switchable at any time (§12.1).

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
| WS-02 | Must | The last opened section per book is remembered, also after a restart and when the book is opened from the library. |
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
| TREE-08 | Must | Trash: trashed sections (with their subtree) disappear from the tree and numbering, appear in the book's Trash list (opened from the sidebar), and can be restored from there at any time. Restore puts the section back at the end of its original parent, or at the root if that parent no longer exists. |
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
| ED-02 | Must | Formatting (stored in content): bold, italic, underline, strikethrough, highlight (several colors), headings (2 levels), blockquote, text alignment, scene break (horizontal rule). Nothing else. Images are separate block elements with their own rules (§5.2). |
| ED-03 | Must | Undo/redo (`Cmd+Z` / `Cmd+Shift+Z`) within the open section. History resets when switching sections. |
| ED-04 | Must | Cut/copy/paste. Pasting from Word or web pages keeps only formatting allowed by ED-02; fonts, sizes and colors are stripped. `Cmd+Shift+V` pastes plain text. |
| ED-05 | Must | Autosave ~1 s after typing stops, and immediately on section switch, view switch, tab hide, and page unload. Save status shown in the top bar (§3). |
| ED-06 | Must | Word count for the current section and the whole book. CJK characters count one each; other text counts by words. Selection count when text is selected. |
| ED-07 | Must | A stale save (e.g. from a second browser tab) is rejected rather than overwriting newer text; the user is told to reload. |
| ED-08 | Must | Find within the current section (`Cmd+F`). |
| ED-09 | Should | Find & replace across the whole book (e.g. rename a character). Shows matches per section before replacing; snapshots every affected section first. Matches do not span formatting boundaries (documented limitation). |
| ED-10 | Should | Section snapshots: browse previous versions of a section with timestamps and restore one (restoring snapshots the current text first). |
| ED-11 | Later | Typewriter scrolling, writing goals/streaks, spell-check settings. |
| ED-12 | Must | No silent loss of typed text: leaving or closing the page while any text is unsaved, saving, or failed to save asks for confirmation; a save the server rejects shows a persistent message with a way to copy the section's text; actions that replace or move text (trash, snapshot restore, export) save pending text first and warn if they cannot. |

### 5.1 Display settings (per book, not stored in the text)

Font family, font size, line height, paragraph spacing, first-line indent (e.g. `2em` for Chinese), editor width, theme (light / dark / sepia), background color, optional background image with opacity.

| ID | Pri | Requirement |
|---|---|---|
| DISP-01 | Must | Font family, size, line height, first-line indent, editor width, light/dark theme. |
| DISP-02 | Should | Background color/image, sepia theme, paragraph spacing. |
| DISP-03 | Must | Only system fonts and fonts bundled with the app are offered. No network font loading. |

### 5.2 Images in the text (illustrations)

Pictures of scenes and characters (for example AI-generated ones) can sit between paragraphs. NovelStudio is a writing tool, not a page-layout tool, so images follow one strict rule: **an image is always a line of its own.** Text never flows around an image, appears beside it, or shares its line, so an image can never break the layout of the text around it.

| ID | Pri | Requirement |
|---|---|---|
| IMG-01 | Must | Insert an image at the cursor with the toolbar's **Image** button (upload a file, or pick one already in the book, IMG-08), by pasting an image file (e.g. *Copy image* in a browser, a screenshot), or by dropping an image file onto the text. If the cursor is inside a paragraph, the paragraph is split there and the image goes between the two halves. |
| IMG-02 | Must | **Block-only layout.** An image always sits on its own line, horizontally centered. There is no text wrapping, floating, inline image, free resizing by dragging, cropping or rotation. Images live only at the top level of the text, never inside a quote, heading or paragraph; an image that ends up inside a quote (e.g. by pasting) is moved to just after it. |
| IMG-03 | Must | Three width presets: **Small** (about ⅓ of the text column), **Medium** (about ⅔, the default) and **Full** (the text column). An image is never enlarged beyond its own pixel size. |
| IMG-04 | Should | Optional **caption** (plain text, at most 300 characters) shown centered under the image in smaller, muted text. Captions do not count as words and are not searched by find or find & replace (documented limitation). |
| IMG-05 | Must | Clicking an image selects it and shows a small bar: width presets, **Caption**, **Replace**, **Remove**. `Delete`/`Backspace` removes a selected image and undo brings it back. An image can be dragged to another place in the same section; it always lands between paragraphs. |
| IMG-06 | Must | **Optimized on insert.** Before upload, the browser shrinks an image whose long edge is over 2,400 px or whose file is over 1.5 MB to at most 2,400 px on the long edge and re-encodes it as WebP. Animated GIFs, images already within both limits, and images the browser cannot make smaller are uploaded unchanged. A **Keep original** checkbox in the insert dialog skips this; the choice is remembered and also applies to pasted and dropped images. Applies to images in the text and header images (§5.3), not to covers, Codex images or the background picture. |
| IMG-07 | Must | **Images are never lost silently.** Removing an image from the text does not delete its file: it stays in the book's images, so undo and snapshot restore (ED-10) still show it. An image used by any section text (live or trashed), any snapshot, a header image, the cover, a Codex entry or the background picture is never deleted automatically. If an image file is missing, its place in the text shows an **Image missing** placeholder and the reference is kept. A section must never become unsaveable because of an image (missing file, image inside a quote, long caption). |
| IMG-08 | Must | **Book images.** The insert dialog and the header image picker list every image of the book (including the cover and Codex images) as thumbnails, so one image can be reused without uploading it again. The dialog shows the total size of the book's images. |
| IMG-09 | Must | **Pasted documents.** Images inside pasted HTML (web pages, Word) are never fetched (no network) and are left out; a notice says to paste or drop the image file itself. An image copied inside NovelStudio and pasted in the same book keeps working. |
| IMG-10 | Should | Copying an image from one book's text and pasting it into another book copies the image file into that book, so it is not shown as missing. If the copy fails, the image is left out with a notice. |
| IMG-11 | Must | **Text, counts and exports.** Images do not count as words and are not part of a section's plain text. The Markdown/TXT export (EXP-01) writes each image as a line `[Image: <caption>]`, or `[Image]` without a caption, in the export's language (§12.1). The full image is only in the cold backup. |
| IMG-12 | Should | Display setting **Show images** (DISP, per book, on by default). When off, each image and header image collapses to a thin one-line placeholder showing its caption, for distraction-free drafting. Nothing in the text changes. |
| IMG-13 | Should | Double-clicking an image opens it full size over the page; `Esc` or a click closes it. |
| IMG-14 | Must | **Cold backup size guard.** Every image is in the cold backup (COLD-03, COLD-09). A cold backup is a single JSON file, so a book's images have a size ceiling (about 300 MB of image files). An export that would exceed it fails before writing anything, with `COLD_BACKUP_TOO_LARGE` and a message giving the book's image total. The insert dialog warns when the book's images pass 200 MB. |

### 5.3 Section header images

| ID | Pri | Requirement |
|---|---|---|
| IMG-20 | Must | Any section (volume, part, chapter or scene) can have one **header image**, shown above its title at the top of the editor: the width of the text column, centered, the whole image visible (never cropped), its height capped at about 40% of the window. |
| IMG-21 | Must | Set, replace and remove the header image from the details panel, and from a small button shown when hovering over the title area. The picker offers upload (optimized as in IMG-06) or an existing book image (IMG-08). |
| IMG-22 | Must | The header image is not part of the text: it does not affect word count, find & replace or snapshots. Duplicating a section copies its header image; trash and restore keep it. A replaced or removed header image is deleted only when nothing else uses it (IMG-07). |
| IMG-23 | Must | Header images are in the cold backup and restored with their section (COLD-09). The Markdown/TXT export leaves them out. |

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
- **Language**: the interface is in English or Simplified Chinese (§12.1); content fully supports CJK text.

### 12.1 Interface language

| ID | Pri | Requirement |
|---|---|---|
| I18N-01 | Must | The whole interface is available in **English** (`en`) and **Simplified Chinese** (`zh-CN`). Every text the app shows comes from the language files, including menus, buttons, dialogs, tooltips, placeholders, empty states, notices, confirmations, error messages, save status, word count labels, `aria-label`s, `title` attributes and the browser tab title. |
| I18N-02 | Must | Switch in **Settings → Language · 语言** (label always shown in both languages). Each language is listed by its own name (`English`, `简体中文`). The switch applies immediately, without reload, and never touches unsaved text. The choice is remembered on this computer. On first start the app follows the browser's language: `zh*` → 简体中文, anything else → English. |
| I18N-03 | Must | Numbers, dates and times are formatted for the chosen language. Word count labels read naturally (`1,234 words` / `1,234 字`); the counting rule itself (ED-06) does not change. |
| I18N-04 | Must | Server errors are shown in the chosen language: the client translates each error `code`. A code without a translation falls back to the server's English message. |
| I18N-05 | Must | **Switching never changes stored data.** Section titles, text, Codex category and field names, map contents, numbering labels and formats stay exactly as they are. |
| I18N-06 | Must | **Text the app creates for you** uses the language active at that moment: a new book's default Codex categories and field labels (field keys stay the same in both languages), its numbering preset (Chinese → `第{n:cn}章` etc., NUM-04), map template titles and node titles, the "copy" suffix of duplicated sections and maps, the *Front matter* section of a text import, and the title suffix of a restored book. TXT/Markdown import keeps offering the preset that fits the file. The CLI scripts and the sample book (`seed:dev`) stay English. |
| I18N-07 | Must | Names that belong to the app, not the book, are translated when shown: section kinds in menus, statuses, map template names, foreshadow roles, statuses and warnings, highlight color names, themes, `(untitled)`. The Markdown/TXT export uses the current interface language for `(untitled)` and image placeholders (IMG-11). |
| I18N-08 | Must | The page's `lang` attribute follows the interface language (`en` / `zh-CN`), so Chinese interface text uses Simplified Chinese glyph forms. |
| I18N-09 | Must | Completeness is enforced: a missing or extra key in the Chinese file is a type error; a test fails on empty translations or placeholders that differ between languages; lint rejects literal text in components. |
| I18N-10 | Should | Fixed English stays English: the cold backup `_readme` and its JSON keys, CLI output, server logs, and the `beforeunload` prompt (the browser controls that text). The user guide stays English for now. |

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
16. Switch to 简体中文 while text is still saving → the whole interface is in Chinese at once, nothing typed is lost; create a book → its Codex starts with 人物, 地点 … and chapters number as `第一章`; switch back to English → that book's data is unchanged.
17. Put the cursor in the middle of a paragraph and paste an image file → the paragraph splits and the image sits on its own line between the halves; set it to *Small*, add a caption, reload → unchanged.
18. Give a chapter a header image → it shows above the chapter title; move the chapter → the image moves with it.
19. Cold backup a book with images in the text and header images, restore it into an empty data directory → every image is back in place; remove an image from the text and restore the previous snapshot → the image shows again.

---

## 14. Out of scope for v1

Accounts, cloud sync, collaboration, mobile apps, AI writing features (including generating images inside the app), publishing integrations, typesetting/print layout, DOCX/EPUB, signed or notarized macOS app bundles, image editing (crop, rotate, filters), text wrapping around images, fetching images from the web, interface languages other than English and Simplified Chinese.

## 15. Decisions log

| Decision | Choice | Reason |
|---|---|---|
| Scenes | Optional fourth tree level (not only scene breaks inside a chapter) | Lets scenes be dragged between chapters; scene breaks (`***`) still exist inside text. |
| Numbering | Continuous through the book by default, configurable per kind | Matches most serialized and print novels. |
| Fonts | Display settings per book, not stored in text | Keeps the manuscript clean; exports stay consistent. |
| Characters vs. worldbuilding | One Codex module | Same data shape; half the code. |
| Default Codex categories (M9) | Created on the server together with the book (blank book and TXT/Markdown import, same transaction). A cold backup restore keeps exactly the categories in the file. A Codex with no categories stays empty and offers an **Add default categories** button (`POST /books/:id/codex/seed`), which is also how pre-M5 books get them | Deleting the last category, or restoring a backup without categories, never silently brings the defaults back; no migration and no new stored data. |
| Nested blockquotes (M9) | Blockquotes never nest: `normalizeContent` unwraps a quote inside a quote into the outer one (text, marks and order unchanged) in the editor, the paste cleaner, the server before validating a save, cold backup restore, find & replace and snapshot restore. The content depth limit stays as a safety bound | A pasted email thread or repeated `> ` could exceed the depth limit and make every later save of the section fail. |
| "Characters in this section" | Computed from names and aliases in the section text, not from stored links | No new data to back up or remap; manual links stay possible later. |
| Native project format | The cold backup JSON | One format to maintain, readable without the app. |
| Hot backup restore (HOT-02) | Staged, applied at the next server start before the database opens; the replaced database files are kept in `backups/replaced-<time>/` | The running server never swaps its own SQLite file, and nothing that was written after the request is lost. |
| Pending hot restore and the CLI scripts (M9) | Only the server applies a pending restore. While one is pending, `restore:cold` and `seed:dev` refuse (exit code 1); `backup:cold` runs and notes that it backs up the current database | A script must not swap the database files under a running server, and a book restored now would vanish when the pending restore is applied. |
| Text import size | 25 MB; larger files are refused with a warning, never truncated | A silently cut manuscript is worse than a refusal. |
| Background picture (DISP-02) | An image asset of the book, referenced from the display settings | Reuses the asset pipeline (type sniffing, cold backup, restore remap); no new table. |
| Installable app | PWA manifest only, no service worker | Chrome/Edge can install from the manifest; a service worker would add a cache that could serve stale code. |
| Launcher | `NovelStudio.command` keeps the server in its Terminal window; Ctrl+C stops it | Simple and visible; a background service and stop command are for the later deployment stage. |
| Interface language (M10) | English and Simplified Chinese, with typed dictionaries in the client and the browser's `Intl`. No i18n library. The choice is UI state in `localStorage` (like fold state), not book data | Two languages do not justify a dependency. The compiler catches missing keys. The language is a preference of this computer, not part of a book, so it is not in the cold backup. |
| Text the app creates (M10) | Created in the interface language of that moment and never rewritten later. Field keys are language-neutral | Switching language must never touch the user's data. Codex logic (e.g. "characters in this section") keys on field keys, not on names. |
| Images in the text (M11) | A top-level block node `image` with `assetId`, `size` (`small`/`medium`/`full`) and `caption`. Always its own line, centered. No inline images, wrapping or free resizing | Keeps the editor a writing tool. Layout can never break, and the content model stays simple to validate, normalize and restore. |
| Images and plain text (M11) | Images are not in `plain_text` and do not count as words. Exports write a `[Image: caption]` line | Word counts, search and find & replace stay exactly as before. |
| Deleting image files (M11) | Removing an image from the text never deletes its file. The automatic deletion that already exists (replacing a cover, Codex image, background or header image) also checks every section's text, trashed sections and snapshots | Undo and snapshot restore must still find the image. Orphan cleanup stays a *Later* item. |
| Image optimization (M11) | In the browser before upload (long edge ≤ 2,400 px, WebP), on by default, with **Keep original** | AI images are often 2–5 MB PNGs. Optimizing keeps books and cold backups small without a new dependency. |
| Cold backup size (M11) | Stays one JSON file (format v1). Exports over the ceiling (~300 MB of images per book) fail cleanly with `COLD_BACKUP_TOO_LARGE` | Node strings are limited to ~512 MB, and the backup is built and verified as one string. A multi-file format is a *Later* item, if ever needed. |
| Header images (M11) | A nullable `nodes.header_asset_id` (any section kind), shown above the title. Not part of `content` | The title is not part of the text, so the image belongs to the section, not its content. One rule for every kind. |
