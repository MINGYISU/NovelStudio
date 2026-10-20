# NovelStudio

A personal, local-first writing app for long-form fiction. It runs on your own machine (a small Node server and a browser UI on `127.0.0.1`), with no accounts, cloud, or subscriptions.

**Status:** planning. No code yet. Implementation follows [docs/ROADMAP.md](docs/ROADMAP.md) one milestone at a time.

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
npm run dev        # development, uses ./.data-dev with sample data
npm run build
npm start          # real use: http://127.0.0.1:4317, data in ~/Library/Application Support/NovelStudio
```

## Where your data lives

| What | Where |
|---|---|
| Live database, images, hourly backups | `~/Library/Application Support/NovelStudio/` |
| Cold backups (JSON) | The folder you choose in Settings, ideally on another drive or a synced folder |

## License

[MIT](LICENSE)
