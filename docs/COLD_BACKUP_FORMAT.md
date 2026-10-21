# NovelStudio — Cold Backup Format (v1)

A **cold backup** is the last line of defense: one pretty-printed JSON file per book that contains everything needed to rebuild the book, readable by a human or any programming language **without NovelStudio, SQLite, or the data directory**. It is intentionally not optimized for size or speed.

The same format is the app's native project export/import format (PRD `EXP-02`, `IMP-01`).

Requirements: PRD §11.4 (`COLD-01` … `COLD-11`). Implementation: ARCHITECTURE §10.2.

---

## 1. Where files go

```
<cold backup folder>/                              chosen by the user in Settings
└─ <title-slug>__<bookId first 8 chars>/           one folder per book
   ├─ 2026-10-20_184909Z__<title-slug>.novelstudio.json
   ├─ 2026-10-20_184909Z__<title-slug>.novelstudio.json.sha256
   ├─ 2026-10-27_090112Z__<title-slug>.novelstudio.json
   └─ 2026-10-27_090112Z__<title-slug>.novelstudio.json.sha256
```

- Timestamps are UTC (`Z`), so names sort chronologically.
- The per-book folder is matched by the **book ID suffix**, not the title. If the book is renamed, the old folder keeps being used.
- If two exports of one book land in the same second, the later file gets `-2`, `-3`, … after the timestamp (`2026-10-20_184909Z-2__…`); an existing file is never overwritten.
- Nothing is ever deleted unless the user enabled *keep newest N per book*; that setting only touches this book's own `*.novelstudio.json` files and their `.sha256` files.

## 2. Title slug

Used only for file and folder names (never as identity):

1. Unicode-normalize to NFC.
2. Replace `/ \ : * ? " < > |`, control characters, and a leading `.` with `_`.
3. Collapse runs of whitespace into `-`.
4. Trim to 60 characters (do not cut a surrogate pair); empty → `untitled`.

CJK titles are kept as-is (`我的小说__3f2a9c1b/`).

## 3. Integrity sidecar

`<file>.sha256` contains one line in the format produced by `shasum -a 256`:

```
9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08  2026-10-20_184909Z__my-novel.novelstudio.json
```

Verify on macOS without the app:

```sh
cd "<book folder>" && shasum -a 256 -c 2026-10-20_184909Z__my-novel.novelstudio.json.sha256
```

Or with the app's CLI: `npm run verify:cold -- <file>`.

---

## 4. Document structure

Top-level keys appear **in this order** (so `_readme` is the first thing anyone sees when opening the file):

| Key | Type | Description |
|---|---|---|
| `_readme` | string | Plain-English explanation of this file (fixed text, §6). |
| `format` | `"novelstudio.cold-backup"` | Identifies the file type. |
| `formatVersion` | integer | `1` for this spec. |
| `exportedAt` | ISO-8601 UTC string | When the file was written. |
| `app` | object | `{ name, version, dbSchemaVersion }` of the exporting app. Informational. |
| `stats` | object | Counts used to verify the file after writing: `sections`, `trashedSections`, `words`, `codexCategories`, `codexEntries`, `maps`, `foreshadows`, `occurrences`, `assets`, `snapshots`. |
| `warnings` | string[] | Problems noticed during export (e.g. an asset checksum mismatch). Usually empty. |
| `book` | object | Book metadata and settings (§4.1). |
| `manuscript` | Section[] | **Live** manuscript as a nested tree, top-level sections in reading order (§4.2). |
| `trash` | TrashedSection[] | Trashed subtrees (§4.3). |
| `codex` | object | `{ categories: Category[], entries: Entry[] }` (§4.4). |
| `maps` | Map[] | Story maps (§4.5). |
| `foreshadows` | Foreshadow[] | Threads with nested occurrences (§4.6). |
| `assets` | Asset[] | All images, embedded (§4.7). |
| `snapshots` | Snapshot[] \| null | Only when *include snapshots* is enabled; otherwise `null`. |

Keys not yet supported by the exporting app's milestone are still present with empty values (`[]`, `{ "categories": [], "entries": [] }`), so the shape is always the same.

### 4.1 `book`

```json
{
  "id": "3f2a9c1b-7d2e-4b8a-9c11-0a5b6e7f8d90",
  "title": "The Lantern Road",
  "author": "",
  "description": "",
  "coverAssetId": "a1b2c3d4-0000-4000-8000-000000000001",
  "settings": { "structure": { }, "display": { }, "foreshadow": { } },
  "createdAt": "2026-10-01T12:00:00.000Z",
  "updatedAt": "2026-10-20T18:40:00.000Z"
}
```

`settings` is the book's full settings object as stored by the app (numbering formats, display preferences, dormant threshold).

### 4.2 `Section` (manuscript node)

```json
{
  "id": "…",
  "kind": "chapter",
  "title": "Reunion",
  "displayTitle": "Chapter 3 — Reunion",
  "numbered": true,
  "status": "draft",
  "synopsis": "",
  "wordCount": 3120,
  "plainText": "The rain had stopped…\n\nShe did not look up.",
  "content": { "type": "doc", "content": [ ] },
  "rev": 42,
  "createdAt": "…",
  "updatedAt": "…",
  "children": [ ]
}
```

- **Order is the array order.** There is no `position` or `parentId`; nesting and order are explicit, so the structure is obvious to a human reader.
- `displayTitle` is computed at export time from the settings; it is informational and ignored on restore.
- `plainText` is the readable text; `content` is the rich text as ProseMirror/Tiptap JSON and is authoritative on restore. If `content` is missing or invalid on restore, the section is rebuilt from `plainText` (paragraph per blank-line block) and a warning is reported.

- A section whose stored formatted text cannot be read is exported with `"content": null` and a note in `warnings`; `plainText` is still there.

### 4.3 `TrashedSection`

Ordered by `deletedAt`, then id. A `Section` (with its `children`, which are the descendants that were not trashed separately) plus:

| Key | Description |
|---|---|
| `deletedAt` | When it was trashed. |
| `originalParentId` | Parent ID at the time of trashing, or `null` for root. |

### 4.4 Codex

Categories are in display order and entries are ordered by category, then by position; `position` is informational (restore takes it from array order). `fields` are the entry's own ordered fields: `key` is a stable identifier (renaming a field only changes `label`), `type` is `text` or `longtext`. `fieldTemplate` is the category template that new entries copy.

```json
{
  "categories": [
    { "id": "…", "name": "Characters", "position": 0,
      "fieldTemplate": [ { "key": "name", "label": "Name", "type": "text" } ] }
  ],
  "entries": [
    { "id": "…", "categoryId": "…", "title": "Lin Yao", "summary": "",
      "fields": [ { "key": "personality", "label": "Personality", "type": "longtext", "value": "…" } ],
      "imageAssetId": null, "position": 0, "createdAt": "…", "updatedAt": "…" }
  ]
}
```

### 4.5 `Map`

`{ id, title, template, position, createdAt, updatedAt, data }` where `data` is the `MapData` object from ARCHITECTURE §9. Node links (`{ type: "node" | "codex", id }`) refer to IDs in this same file.

### 4.6 `Foreshadow`

```json
{
  "id": "…", "title": "The broken compass", "description": "", "status": "planted",
  "color": "#c0841a", "notes": "", "createdAt": "…", "updatedAt": "…",
  "occurrences": [
    { "id": "…", "nodeId": "…", "role": "setup", "excerpt": "", "note": "",
      "anchored": false, "anchorState": null, "createdAt": "…" }
  ]
}
```

`nodeId` may refer to a section in `manuscript` or in `trash`, or be `null` if the section was permanently deleted.

### 4.7 `Asset`

```json
{
  "id": "a1b2c3d4-0000-4000-8000-000000000001",
  "fileName": "cover.jpg",
  "mime": "image/jpeg",
  "bytes": 183442,
  "sha256": "…",
  "dataBase64": "/9j/4AAQSkZJRgABAQ…"
}
```

To recover an image by hand: copy `dataBase64` into a file and run `base64 -D -i data.txt -o cover.jpg` (macOS).

### 4.8 `Snapshot` (optional)

`{ id, nodeId, content, wordCount, reason, createdAt }`.

---

## 5. Restore rules

1. Verify the `.sha256` sidecar if present; on mismatch, warn and ask before continuing.
2. Require `format == "novelstudio.cold-backup"`. If `formatVersion` is older, run upgraders in order; if newer than the app supports, refuse.
3. Validate with the Zod schema (`src/shared/schemas/cold-backup.ts`).
4. If `book.id` (or any other ID) already exists in the target database, regenerate **all** IDs and rewrite every reference: section nesting, `book.coverAssetId`, codex `categoryId` and `imageAssetId`, map node links, occurrence `nodeId`, `foreshadowAnchor` marks inside `content`, snapshot `nodeId`.
5. Positions come from array order; `displayTitle`, `wordCount`, `plainText`, and `stats` are recomputed, not trusted.
6. Write assets (checksum verified), insert everything in one transaction, check tree invariants. Any failure rolls everything back.
7. Restore is defensive because the file is untrusted: images are re-checked by their bytes (only PNG, JPEG, WebP and GIF; anything else is skipped), image file names are sanitized, and `content` that does not match the editor's allowed formatting is rebuilt from `plainText`. Everything skipped or repaired is reported as a warning. Codex field keys and labels that break the app's rules are repaired (and over-long values shortened), an entry whose category is missing is skipped, and an entry image that is unavailable is removed from the entry, each with a warning. Data this app version cannot store yet (maps, foreshadows, before their milestones) is skipped with a warning, never silently.
8. The restored book is always a **new** book. Existing books are never modified. Title gets the suffix ` (restored YYYY-MM-DD)` if a book with the same title exists.

---

## 6. `_readme` text (exact)

```
NovelStudio cold backup. This file is a complete, self-contained copy of one book.
- 'manuscript' is the table of contents in reading order; 'children' holds nested sections.
- Each section's readable text is in 'plainText'; 'content' is the same text with formatting (ProseMirror JSON).
- 'displayTitle' shows the chapter number as it appeared when exported.
- 'trash' holds deleted-but-recoverable sections; 'codex' holds characters and worldbuilding;
  'maps' holds story diagrams; 'foreshadows' holds setup/payoff threads.
- Images are in 'assets' as base64 ('dataBase64').
- Restore with NovelStudio: Library > New > Import, or `npm run restore:cold -- <this file>`.
- Format specification: docs/COLD_BACKUP_FORMAT.md in the NovelStudio repository.
```

---

## 7. Reading a backup without the app

Extract the whole manuscript as plain text in reading order (requires `jq`, available via Homebrew):

```sh
jq -r '.manuscript[] | recurse(.children[]) | "\n\n## " + .displayTitle + "\n\n" + .plainText' \
  "2026-10-20_184909Z__my-novel.novelstudio.json" > manuscript.txt
```

List all characters and their fields:

```sh
jq -r '.codex as $c
  | ($c.categories[] | select(.name == "Characters") | .id) as $cid
  | $c.entries[] | select(.categoryId == $cid)
  | "\n# " + .title + "\n" + ([.fields[] | "- " + .label + ": " + .value] | join("\n"))' \
  "2026-10-20_184909Z__my-novel.novelstudio.json"
```

Any language with a JSON parser can do the same; the structure above is all you need.

---

## 8. Versioning rules

- Adding an optional key with a default → same `formatVersion`; restore treats a missing key as the default.
- Renaming, removing, or changing the meaning of a key → increment `formatVersion` and add an upgrader `vN → vN+1` in `src/shared/schemas/cold-backup-upgrade.ts` with a fixture test using a real file of the old version from `tests/fixtures/`.
- Old versions stay importable forever.
