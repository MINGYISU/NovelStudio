# AGENTS.md — Rules for AI coding agents

NovelStudio is a personal, local-first novel writing app. The user writes real novels in it, so **data safety beats speed, cleverness, and features**.

## Read first

1. [docs/PRD.md](docs/PRD.md): what to build (requirement IDs such as `MOVE-05`).
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how to build it (stack, schema, algorithms, API).
3. [docs/ROADMAP.md](docs/ROADMAP.md): which milestone is in progress and its done-when checklist.
4. [docs/COLD_BACKUP_FORMAT.md](docs/COLD_BACKUP_FORMAT.md): the last-resort backup format.

If these documents conflict with each other or with a request, stop and ask. Do not resolve conflicts silently.

## Workflow

- Work on **one milestone** (or the specific task requested). Do not implement features from later milestones "while you're at it".
- Before coding, restate the scope, the files you will touch, and the tests you will add; wait for approval when the user asked for it.
- Finish with `npm run typecheck`, `npm run lint`, `npm test` (and `npm run test:e2e` from M3) all passing. Report the results honestly, including anything skipped.
- Every bug fix gets a regression test.
- When behavior or decisions change, update the relevant doc in `docs/` in the same change, and tick the milestone status in `docs/ROADMAP.md` only after the user accepts it.
- Commit messages: `M3: drag-and-drop between parents (MOVE-01, MOVE-04)` style; reference requirement IDs.

## Data safety (non-negotiable)

- **Never read, write, move, or delete** anything in the real data directory `~/Library/Application Support/NovelStudio/` or in any cold backup folder. Do not run `npm start` or any script without `NOVEL_DATA_DIR` set to a dev/temp path.
- Development uses `./.data-dev/`; tests use fresh temp directories. Keep the server's refuse-to-start guard (ARCHITECTURE §4) intact.
- Never commit databases, backups, `.novelstudio.json` files with real content, or anything from a data directory. Test fixtures contain made-up text only.
- Schema changes **only** via a new numbered file in `src/server/db/migrations/`. Never edit an existing migration. Never drop a table or column that holds user data without an explicit, approved data-migration plan.
- Every write touching more than one row runs in a single transaction.
- Any new persistent data (table, column, JSON field, asset type) must be added **in the same change** to: cold backup export, restore (including ID remapping), the Zod format schema, and the round-trip test. See PRD `COLD-09`.
- Never weaken backups: no changes that skip hot backups before migrations, write cold backups non-atomically, or delete old cold backups by default.

## Technical rules

- Stack is fixed by ARCHITECTURE §2. **Do not add dependencies** without asking; if approved, add them to that table. Install with exact versions (`.npmrc` enforces `save-exact`).
- TypeScript `strict`. No `any` except immediately after Zod validation boundaries. Validate every API body and every JSON column read with Zod schemas from `src/shared/schemas/`.
- `src/shared/` stays pure: no DOM, no Node APIs, no I/O. Tree, numbering, word count, foreshadow analysis, and import splitting live there and are unit-tested.
- SQL lives only in `src/server/repos/`. Routes call services/repos; they do not contain SQL.
- IDs are `crypto.randomUUID()`. References always use IDs, never titles, numbers, or positions.
- Chapter numbers are computed (`numbering.ts`), never stored.
- Server binds to `127.0.0.1` only. No telemetry, analytics, update checks, CDN fonts/scripts, or other network calls at runtime.
- Treat imported files, pasted HTML, and uploaded images as untrusted (ARCHITECTURE §13).
- Keep UI minimal and calm; follow existing components and CSS variables. No new visual frameworks.
- All interface text goes through `t()` with both `en` and `zh-CN` entries; never hardcode UI text; follow the glossary in ROADMAP M10.
- Comments only where the code needs clarification.

## When unsure

Ask the user. Prefer a small question over a large wrong assumption, especially about anything that touches stored data.
