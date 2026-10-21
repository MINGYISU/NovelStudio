# NovelStudio

A personal, local-first writing app for long-form fiction. It runs on your own machine (a small Node server and a browser UI on `127.0.0.1`), with no accounts, cloud, or subscriptions.

**Status:** M0 (skeleton & safety) implemented, awaiting acceptance. Implementation follows [docs/ROADMAP.md](docs/ROADMAP.md) one milestone at a time.

## Features (planned)

- **Library** of books with covers.
- **Manuscript tree**: volumes, parts, chapters, and scenes with drag-and-drop reordering and automatic renumbering (English or Chinese numbering, e.g. `第三章`).
- **Editor** with essential formatting, autosave, snapshots, and per-book display settings.
- **Story maps**: node-and-edge diagrams for plot, timelines, and character arcs.
- **Foreshadowing tracker**: setups, hints, and payoffs linked to chapters, with warnings when reordering breaks them.
- **Codex**: character cards and worldbuilding entries with custom fields.
- **Layered data protection**: autosave, snapshots, hourly database backups, and a human-readable **cold backup** JSON file in a folder you choose.

## Documents

| Document | Purpose |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Product requirements (what) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical design (how) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and prompts for each step |
| [docs/COLD_BACKUP_FORMAT.md](docs/COLD_BACKUP_FORMAT.md) | Last-resort JSON backup format |
| [AGENTS.md](AGENTS.md) | Rules for AI coding agents working on this repo |

## Running (after milestone M0)

Requires Node.js 24 or newer (see `.nvmrc`).

```sh
npm install
npm run dev        # development: UI on http://127.0.0.1:5173, API on :4318, data in ./.data-dev
npm run build
npm start          # real use: http://127.0.0.1:4317, data in ~/Library/Application Support/NovelStudio
```

### Double-click launcher and "Install app"

`NovelStudio.command` (double-click in Finder, or `./NovelStudio.command`) starts the server in a Terminal window if it is not already running and opens the app in your browser. Press Ctrl+C in that window to stop the server. If the server is already running it only opens the browser. It builds the app first when there is no build yet or the sources are newer.

In Chrome or Edge, open the app and choose **Install NovelStudio** (address bar icon or the browser menu) to get its own window and Dock icon. This only adds a window; the server must still be running.

## Importing and exporting text

- **Import:** library → **New → Import text or Markdown…** reads a `.txt` or `.md` file (UTF-8, or GB18030 for older Chinese files, up to 25 MB), shows the detected chapters, and creates a new book only after you confirm.
- **Export:** book card menu or workspace menu → **Export Markdown** / **Export plain text** (reading order, display titles, no trash).

## Backups of the database

Settings → **Automatic database backups** lists the hourly database copies and can restore one. A restore is applied the next time the server starts; the database it replaces is kept under `backups/replaced-<time>/` in the data folder.

## Cold backups

Set a folder in **Settings** (ideally on another disk or a synced folder), then export a book from its card menu, the workspace menu, or **Export all books**. Each export is a plain JSON file with a `.sha256` file next to it:

```sh
cd "<book folder>" && shasum -a 256 -c <file>.novelstudio.json.sha256   # verify
npm run verify:cold -- <file>                                           # verify with the app's checks
npm run backup:cold -- --out <folder>                                   # export all books from the command line
npm run restore:cold -- <file>                                          # restore as a new book, no UI needed
```

The command-line scripts use `./.data-dev` unless `NOVEL_DATA_DIR` is set. For your real data run them with `NODE_ENV=production`, for example `NODE_ENV=production npm run backup:cold`. A backup can also be restored from the library: **New → Import cold backup**.

## Where your data lives

| What | Where |
|---|---|
| Live database, images, hourly backups | `~/Library/Application Support/NovelStudio/` |
| Cold backups (JSON) | The folder you choose in Settings, ideally on another drive or a synced folder |

## License

[MIT](LICENSE)
