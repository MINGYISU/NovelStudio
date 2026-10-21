import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Book } from '../shared/schemas/book.ts';
import type { ColdBackupDoc, ColdSection } from '../shared/schemas/cold-backup.ts';
import type { ExportResult } from '../shared/schemas/cold-backup-settings.ts';
import { COLD_BACKUP_README } from '../shared/cold-backup.ts';
import type { Thread } from '../shared/schemas/foreshadow.ts';
import type { MapData, StoryMap } from '../shared/schemas/map.ts';
import { CHINESE_STRUCTURE } from '../shared/schemas/structure.ts';
import { assertTreeInvariants } from '../shared/tree.ts';
import { readConfig } from './config.ts';
import { getBook } from './repos/books.ts';
import { listNodes } from './repos/nodes.ts';
import { ColdBackupService, verifyColdBackup } from './services/cold-backup.ts';
import { restoreColdBackup } from './services/cold-backup-restore.ts';
import { Harness, multipartBody, paragraphs, TINY_PNG } from './test-support.ts';

const MISSING = '00000000-0000-4000-8000-000000000000';
const T0 = Date.parse('2026-10-20T18:49:09.400Z');

let h: Harness;
let other: Harness | null = null;
let backupDir: string;

beforeEach(async () => {
  h = await new Harness().start();
  backupDir = path.join(h.tmp, 'cold');
  fs.mkdirSync(backupDir);
});
afterEach(async () => {
  await h.cleanup();
  if (other) await other.cleanup();
  other = null;
});

const service = (harness = h, now = () => new Date(T0)) =>
  new ColdBackupService({
    db: harness.store.db,
    paths: harness.store.paths,
    homedir: harness.home,
    now,
  });

function readDoc(file: string): ColdBackupDoc {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as ColdBackupDoc;
}

/**
 * Codex data of every shape: a reordered default category set, an extra empty category, a custom
 * template, entries with a custom/renamed/reordered/removed field, an image and a reorder.
 */
async function addCodex(harness: Harness, bookId: string, imageAssetId: string) {
  const seeded = (await harness.api('POST', `/api/books/${bookId}/codex/seed`)).json<{
    categories: { id: string; name: string }[];
  }>().categories;
  const characters = seeded.find((c) => c.name === 'Characters')!;
  const locations = seeded.find((c) => c.name === 'Locations')!;
  const magic = (
    await harness.api('POST', `/api/books/${bookId}/codex/categories`, {
      name: 'Magic',
      fieldTemplate: [{ key: 'rules', label: 'Rules', type: 'longtext' }],
    })
  ).json<{ category: { id: string } }>().category;
  await harness.api('POST', `/api/codex/categories/${magic.id}/move`, { index: 1 });
  await harness.api('PATCH', `/api/codex/categories/${locations.id}`, { name: 'Places' });

  const entry = async (categoryId: string, title: string, summary = '') =>
    (
      await harness.api('POST', `/api/books/${bookId}/codex/entries`, {
        categoryId,
        title,
        summary,
      })
    ).json<{ entry: { id: string; fields: object[] } }>().entry;
  const lin = await entry(characters.id, 'Lin Yao', 'A courier');
  const mo = await entry(characters.id, 'Mo Han');
  const gate = await entry(locations.id, 'Harbour Gate', '港口的门');
  await harness.api('PATCH', `/api/codex/entries/${lin.id}`, {
    fields: [
      { key: 'name', label: 'Name', type: 'text', value: 'Lin Yao' },
      { key: 'aliases', label: 'Also known as', type: 'text', value: 'Yao, 阿遥' },
      { key: 'f-0a1b2c3d', label: 'Favourite tea', type: 'text', value: 'Jasmine' },
      { key: 'background', label: 'Background', type: 'longtext', value: 'Grew up by the sea.' },
    ],
  });
  await harness.api('PATCH', `/api/codex/entries/${gate.id}`, { imageAssetId });
  await harness.api('POST', `/api/codex/entries/${mo.id}/move`, { index: 0 });
  return {
    codexCategory: characters.id,
    codexMagic: magic.id,
    codexLin: lin.id,
    codexGate: gate.id,
  };
}

/** A plot-tree map whose first node links a section, a trashed section and a codex entry, plus a blank map. */
async function addMaps(
  harness: Harness,
  bookId: string,
  targets: { section: string; trashed: string; entry: string },
) {
  const created = (
    await harness.api('POST', `/api/books/${bookId}/maps`, {
      template: 'plot-tree',
      title: 'Main plot',
    })
  ).json<{ map: StoryMap }>().map;
  const data = structuredClone(created.data);
  data.nodes[0]!.data.links = [
    { type: 'node', id: targets.section },
    { type: 'node', id: targets.trashed },
    { type: 'codex', id: targets.entry },
  ];
  data.nodes[1]!.data.storyTime = 'Spring 1923';
  data.nodes[1]!.data.description = '她没有抬头。';
  data.edges[0]!.label = 'because';
  data.nodes[2]!.position = { x: 321, y: -45 };
  data.viewport = { x: -10, y: 20, zoom: 0.75 };
  data.layoutDirection = 'LR';
  const saved = await harness.api('PUT', `/api/maps/${created.id}/data`, { data });
  expect(saved.statusCode).toBe(200);
  const blank = (
    await harness.api('POST', `/api/books/${bookId}/maps`, { template: 'blank', title: 'Scratch' })
  ).json<{ map: StoryMap }>().map;
  return { mapMain: created.id, mapBlank: blank.id };
}

/**
 * Two threads: one with all three roles in live sections, one whose setup and payoff sit in sections
 * that are trashed afterwards (so they are exported with the trash).
 */
async function addForeshadows(
  harness: Harness,
  bookId: string,
  targets: { ch1: string; scene: string; prologue: string; gone: string; nested: string },
) {
  const thread = async (body: object) =>
    (await harness.api('POST', `/api/books/${bookId}/foreshadows`, body)).json<{
      thread: { id: string };
    }>().thread.id;
  const occurrence = async (threadId: string, body: object) => {
    const res = await harness.api('POST', `/api/foreshadows/${threadId}/occurrences`, body);
    expect(res.statusCode).toBe(201);
  };
  const compass = await thread({
    title: 'The broken compass',
    description: 'Points the wrong way.',
    status: 'planted',
    color: '#336699',
    notes: '她没有抬头。 Notes.',
  });
  await occurrence(compass, {
    nodeId: targets.ch1,
    role: 'setup',
    excerpt: 'The needle shook.',
    note: 'first look',
  });
  await occurrence(compass, { nodeId: targets.scene, role: 'hint' });
  await occurrence(compass, { nodeId: targets.prologue, role: 'payoff', note: 'it points home' });
  const door = await thread({ title: 'The red door' });
  await occurrence(door, { nodeId: targets.gone, role: 'setup' });
  await occurrence(door, { nodeId: targets.nested, role: 'payoff' });
  return { threadCompass: compass, threadDoor: door };
}

/** A book with every kind of data M7 has: nesting, formatting, trash, a cover, display settings, snapshots. */
async function buildRichBook(harness = h): Promise<{ book: Book; ids: Record<string, string> }> {
  const book = await harness.createBook('The Lantern Road');
  const volume = await harness.createNode(book.id, 'volume', null, 'Old Roads');
  const part = await harness.createNode(book.id, 'part', volume.id, 'Beginnings');
  const ch1 = await harness.createNode(book.id, 'chapter', part.id, 'Reunion');
  const scene = await harness.createNode(book.id, 'scene', ch1.id, 'Rain');
  const prologue = await harness.createNode(book.id, 'chapter', null, 'Prologue', {
    numbered: false,
  });
  const gone = await harness.createNode(book.id, 'chapter', part.id, 'Cut chapter');
  const goneChild = await harness.createNode(book.id, 'scene', gone.id, 'Cut scene');
  const nested = await harness.createNode(book.id, 'scene', ch1.id, 'Trashed earlier');

  const save = async (id: string, texts: string[]) => {
    const rev = (await harness.api('GET', `/api/nodes/${id}`)).json().node.rev as number;
    const res = await harness.saveContent(id, paragraphs(...texts), rev);
    expect(res.statusCode).toBe(200);
  };
  await save(ch1.id, ['The rain had stopped.', '她没有抬头。']);
  await save(ch1.id, ['The rain had stopped.', '她没有抬头。', 'A third paragraph.']);
  await save(scene.id, ['Drip.']);
  await save(prologue.id, ['Before everything.']);
  await save(gone.id, ['Deleted words.']);
  await save(goneChild.id, ['Deleted scene words.']);
  await save(nested.id, ['Trashed first.']);
  const threads = await addForeshadows(harness, book.id, {
    ch1: ch1.id,
    scene: scene.id,
    prologue: prologue.id,
    gone: gone.id,
    nested: nested.id,
  });
  await harness.api('DELETE', `/api/nodes/${nested.id}`);
  await harness.api('DELETE', `/api/nodes/${gone.id}`);

  const form = multipartBody([{ name: 'file', filename: 'cover.png', data: TINY_PNG }]);
  const asset = (
    await harness.app.inject({ method: 'POST', url: `/api/books/${book.id}/assets`, ...form })
  ).json<{ id: string }>();
  const backgroundForm = multipartBody([{ name: 'file', filename: 'paper.png', data: TINY_PNG }]);
  const background = (
    await harness.app.inject({
      method: 'POST',
      url: `/api/books/${book.id}/assets`,
      ...backgroundForm,
    })
  ).json<{ id: string }>();
  // Same-millisecond uploads would order by random id; pin the order so tests can rely on assets[0].
  const pin = harness.store.db.prepare('UPDATE assets SET created_at = ? WHERE id = ?');
  pin.run('2026-01-01T00:00:00.000Z', asset.id);
  pin.run('2026-01-02T00:00:00.000Z', background.id);
  const patched = await harness.api('PATCH', `/api/books/${book.id}`, {
    coverAssetId: asset.id,
    author: 'Made Up',
    description: 'Invented.',
    display: {
      fontFamily: 'cjk-serif',
      fontSize: 20,
      lineHeight: 1.8,
      firstLineIndent: 2,
      editorWidth: 800,
      theme: 'sepia',
      paragraphSpacing: 1,
      backgroundColor: '#f4ecd8',
      backgroundImageAssetId: background.id,
      backgroundImageOpacity: 0.4,
    },
  });
  expect(patched.statusCode).toBe(200);
  const codex = await addCodex(harness, book.id, asset.id);
  const maps = await addMaps(harness, book.id, {
    section: ch1.id,
    trashed: gone.id,
    entry: codex.codexLin,
  });
  return {
    book,
    ids: {
      ...codex,
      ...maps,
      ...threads,
      volume: volume.id,
      part: part.id,
      ch1: ch1.id,
      scene: scene.id,
      prologue: prologue.id,
      gone: gone.id,
      goneChild: goneChild.id,
      nested: nested.id,
      asset: asset.id,
      background: background.id,
    },
  };
}

/** Replaces every UUID by the order of its first appearance, so documents with remapped ids compare equal. */
function canonical(doc: ColdBackupDoc): unknown {
  const seen = new Map<string, string>();
  const text = JSON.stringify({ ...doc, exportedAt: null, app: null }).replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    (id) => {
      if (!seen.has(id)) seen.set(id, `ID${seen.size}`);
      return seen.get(id)!;
    },
  );
  return JSON.parse(text);
}

function allIds(doc: ColdBackupDoc): string[] {
  const ids = [
    doc.book.id,
    ...doc.assets.map((a) => a.id),
    ...doc.codex.categories.map((c) => c.id),
    ...doc.codex.entries.map((e) => e.id),
    ...doc.maps.map((m) => m.id),
    ...doc.foreshadows.flatMap((f) => [f.id, ...f.occurrences.map((o) => o.id)]),
    ...(doc.snapshots ?? []).map((s) => s.id),
  ];
  const visit = (s: ColdSection) => {
    ids.push(s.id);
    s.children.forEach(visit);
  };
  [...doc.manuscript, ...doc.trash].forEach(visit);
  return ids;
}

/** Every file and folder under `root` with its size, ignoring the live database files. */
function listTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (/novelstudio\.db/.test(entry.name)) continue;
      out.push(
        `${path.relative(root, full)}:${entry.isDirectory() ? 'dir' : fs.statSync(full).size}`,
      );
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(root);
  return out.sort();
}

describe('export (COLD-02..04, EXP-02)', () => {
  it('writes a verified file, a shasum sidecar and a per-book folder, with keys in the documented order', async () => {
    const { book } = await buildRichBook();
    const result = service().exportBook(book.id, { dir: backupDir });

    expect(path.dirname(result.file)).toBe(
      path.join(backupDir, `The-Lantern-Road__${book.id.slice(0, 8)}`),
    );
    expect(path.basename(result.file)).toBe(
      '2026-10-20_184909Z__The-Lantern-Road.novelstudio.json',
    );
    const sidecar = fs.readFileSync(result.checksumFile, 'utf8');
    const bytes = fs.readFileSync(result.file);
    expect(sidecar).toBe(
      `${crypto.createHash('sha256').update(bytes).digest('hex')}  ${path.basename(result.file)}\n`,
    );
    expect(result.sha256).toBe(sidecar.split(' ')[0]);

    const doc = readDoc(result.file);
    expect(Object.keys(doc)).toEqual([
      '_readme',
      'format',
      'formatVersion',
      'exportedAt',
      'app',
      'stats',
      'warnings',
      'book',
      'manuscript',
      'trash',
      'codex',
      'maps',
      'foreshadows',
      'assets',
      'snapshots',
    ]);
    expect(doc._readme).toBe(COLD_BACKUP_README);
    expect(doc).toMatchObject({
      format: 'novelstudio.cold-backup',
      formatVersion: 1,
      exportedAt: '2026-10-20T18:49:09.400Z',
      warnings: [],
      snapshots: null,
    });
    expect(doc.stats).toMatchObject({ codexCategories: 9, codexEntries: 3 });
    expect(verifyColdBackup(result.file)).toMatchObject({ ok: true, checksum: 'ok', problems: [] });
  });

  it('exports the tree in reading order with display titles, plain text, trash and the cover image', async () => {
    const { book, ids } = await buildRichBook();
    const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);

    expect(doc.book).toMatchObject({
      id: book.id,
      title: 'The Lantern Road',
      author: 'Made Up',
      coverAssetId: ids.asset,
    });
    expect(doc.book.settings.display).toMatchObject({
      fontFamily: 'cjk-serif',
      theme: 'sepia',
      paragraphSpacing: 1,
      backgroundColor: '#f4ecd8',
      backgroundImageAssetId: ids.background,
      backgroundImageOpacity: 0.4,
    });
    expect(doc.assets.map((a) => a.id)).toContain(ids.background);
    expect(doc.manuscript.map((s) => s.displayTitle)).toEqual(['Volume I — Old Roads', 'Prologue']);
    const part = doc.manuscript[0]!.children[0]!;
    expect(part.displayTitle).toBe('Part 1 — Beginnings');
    const ch1 = part.children[0]!;
    expect(ch1).toMatchObject({
      displayTitle: 'Chapter 1 — Reunion',
      rev: 2,
      wordCount: 3 * 0 + 4 + 5 + 3,
    });
    expect(ch1.plainText).toBe('The rain had stopped.\n\n她没有抬头。\n\nA third paragraph.');
    expect(ch1.content).toMatchObject({ type: 'doc' });
    expect(ch1.children.map((c) => c.title)).toEqual(['Rain']);

    expect(doc.trash.map((t) => t.title).sort()).toEqual(['Cut chapter', 'Trashed earlier']);
    const cut = doc.trash.find((t) => t.title === 'Cut chapter')!;
    expect(cut.originalParentId).toBe(ids.part);
    expect(cut.children.map((c) => c.title)).toEqual(['Cut scene']);
    expect(doc.trash.find((t) => t.title === 'Trashed earlier')!.originalParentId).toBe(ids.ch1);

    expect(doc.assets).toHaveLength(2);
    expect(Buffer.from(doc.assets[0]!.dataBase64, 'base64').equals(TINY_PNG)).toBe(true);
    expect(doc.stats).toMatchObject({ sections: 5, trashedSections: 3, assets: 2, snapshots: 0 });
  });

  it('reproduces the manuscript with the jq recipe of COLD_BACKUP_FORMAT §7', async () => {
    const { book } = await buildRichBook();
    const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);
    const walk = (list: ColdSection[]): ColdSection[] =>
      list.flatMap((s) => [s, ...walk(s.children)]);
    const text = walk(doc.manuscript)
      .map((s) => `\n\n## ${s.displayTitle}\n\n${s.plainText}`)
      .join('');
    expect(text).toContain('## Chapter 1 — Reunion\n\nThe rain had stopped.\n\n她没有抬头。');
    expect(text).not.toContain('Deleted words');
  });

  it('includes snapshots only when asked, and the setting is the default', async () => {
    const { book } = await buildRichBook();
    const without = readDoc(service().exportBook(book.id, { dir: backupDir }).file);
    expect(without.snapshots).toBeNull();
    const withSnaps = readDoc(
      service().exportBook(book.id, { dir: backupDir, includeSnapshots: true }).file,
    );
    expect(withSnaps.snapshots!.length).toBeGreaterThan(0);
    expect(withSnaps.stats.snapshots).toBe(withSnaps.snapshots!.length);
  });

  it('keeps older backups and never overwrites one made in the same second', async () => {
    const { book } = await buildRichBook();
    const svc = service();
    const first = svc.exportBook(book.id, { dir: backupDir });
    const second = svc.exportBook(book.id, { dir: backupDir });
    expect(second.file).not.toBe(first.file);
    expect(path.basename(second.file)).toContain('184909Z-2__');
    expect(fs.existsSync(first.file) && fs.existsSync(second.file)).toBe(true);
    expect(verifyColdBackup(first.file).ok && verifyColdBackup(second.file).ok).toBe(true);
  });

  it('reuses the existing folder for a renamed book', async () => {
    const { book } = await buildRichBook();
    const first = service().exportBook(book.id, { dir: backupDir });
    await h.api('PATCH', `/api/books/${book.id}`, { title: 'Renamed' });
    const second = service(h, () => new Date(T0 + 1000)).exportBook(book.id, { dir: backupDir });
    expect(path.dirname(second.file)).toBe(path.dirname(first.file));
    expect(path.basename(second.file)).toContain('__Renamed.');
  });

  it('records the last backup in config.json for the reminder badges', async () => {
    const { book } = await buildRichBook();
    const result = service().exportBook(book.id, { dir: backupDir });
    expect(readConfig(h.dataDir).coldBackup.last[book.id]).toEqual({
      at: '2026-10-20T18:49:09.400Z',
      file: result.file,
    });
  });
});

describe('safe failure (COLD-04, COLD-05)', () => {
  it('fails with COLD_BACKUP_LOCATION_UNAVAILABLE for a missing folder and writes nothing anywhere', async () => {
    const { book } = await buildRichBook();
    const before = listTree(h.tmp);
    const configBefore = fs.readFileSync(h.store.paths.configFile, 'utf8');

    const res = await h.api('POST', `/api/books/${book.id}/cold-backup`, {
      dir: path.join(h.tmp, 'unplugged', 'Backups'),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('COLD_BACKUP_LOCATION_UNAVAILABLE');

    expect(fs.existsSync(path.join(h.tmp, 'unplugged'))).toBe(false);
    expect(listTree(h.tmp)).toEqual(before);
    expect(fs.readFileSync(h.store.paths.configFile, 'utf8')).toBe(configBefore);
  });

  it('is not redirected to the saved location when a one-off folder is unavailable', async () => {
    const { book } = await buildRichBook();
    await h.api('PUT', '/api/settings/cold-backup', { dir: backupDir });
    const res = await h.api('POST', `/api/books/${book.id}/cold-backup`, {
      dir: path.join(h.tmp, 'gone', 'x'),
    });
    expect(res.json().error.code).toBe('COLD_BACKUP_LOCATION_UNAVAILABLE');
    expect(fs.readdirSync(backupDir)).toEqual([]);
  });

  it('creates the final folder when its parent exists', async () => {
    const { book } = await buildRichBook();
    const target = path.join(h.tmp, 'new-folder');
    const result = service().exportBook(book.id, { dir: target });
    expect(fs.existsSync(result.file)).toBe(true);
  });

  it('fails for an export-all to a missing folder without writing anything', async () => {
    await buildRichBook();
    const before = listTree(h.tmp);
    const res = await h.api('POST', '/api/cold-backup/all', {
      dir: path.join(h.tmp, 'nope', 'deeper'),
    });
    expect(res.json().error.code).toBe('COLD_BACKUP_LOCATION_UNAVAILABLE');
    expect(listTree(h.tmp)).toEqual(before);
  });

  it('refuses locations inside the data directory or the source folder, and relative paths', async () => {
    const { book } = await buildRichBook();
    const repoRoot = path.join(h.tmp, 'repo');
    fs.mkdirSync(path.join(repoRoot, 'backups'), { recursive: true });
    const svc = new ColdBackupService({
      db: h.store.db,
      paths: h.store.paths,
      repoRoot,
      homedir: h.home,
    });
    for (const dir of [
      path.join(h.dataDir, 'backups'),
      h.dataDir,
      path.join(repoRoot, 'backups'),
      'relative/path',
    ]) {
      expect(() => svc.exportBook(book.id, { dir })).toThrowError(
        expect.objectContaining({ code: 'COLD_BACKUP_LOCATION_INVALID' }),
      );
    }
    expect(fs.readdirSync(path.join(repoRoot, 'backups'))).toEqual([]);
  });

  it('refuses a folder inside the real data directory even when the app runs elsewhere', async () => {
    const { book } = await buildRichBook();
    const real = path.join(h.home, 'Library', 'Application Support', 'NovelStudio');
    fs.mkdirSync(real, { recursive: true });
    expect(() => service().exportBook(book.id, { dir: path.join(real, 'cold') })).toThrowError(
      expect.objectContaining({ code: 'COLD_BACKUP_LOCATION_INVALID' }),
    );
  });

  it.skipIf(process.getuid?.() === 0)('reports a read-only folder as unavailable', async () => {
    const { book } = await buildRichBook();
    const readOnly = path.join(h.tmp, 'readonly');
    fs.mkdirSync(readOnly);
    fs.chmodSync(readOnly, 0o500);
    try {
      expect(() => service().exportBook(book.id, { dir: readOnly })).toThrowError(
        expect.objectContaining({ code: 'COLD_BACKUP_LOCATION_UNAVAILABLE' }),
      );
    } finally {
      fs.chmodSync(readOnly, 0o700);
    }
  });

  it('asks for a folder when none is configured', async () => {
    const { book } = await buildRichBook();
    const res = await h.api('POST', `/api/books/${book.id}/cold-backup`, {});
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('COLD_BACKUP_NOT_CONFIGURED');
  });

  it('is 404 for an unknown book', async () => {
    const res = await h.api('POST', `/api/books/${MISSING}/cold-backup`, { dir: backupDir });
    expect(res.statusCode).toBe(404);
    expect(fs.readdirSync(backupDir)).toEqual([]);
  });
});

describe('verify', () => {
  it('detects a changed file and a stats mismatch', async () => {
    const { book } = await buildRichBook();
    const { file } = service().exportBook(book.id, { dir: backupDir });
    const original = fs.readFileSync(file, 'utf8');

    fs.writeFileSync(file, original.replace('Drip.', 'Drop.'));
    expect(verifyColdBackup(file)).toMatchObject({ ok: false, checksum: 'mismatch' });

    fs.rmSync(file + '.sha256');
    const tampered = JSON.parse(original) as ColdBackupDoc;
    tampered.stats.sections += 1;
    fs.writeFileSync(file, JSON.stringify(tampered));
    const result = verifyColdBackup(file);
    expect(result).toMatchObject({ ok: false, checksum: 'missing' });
    expect(result.problems.join(' ')).toContain('stats.sections');
  });

  it('rejects other JSON, bad JSON, newer versions and missing files', async () => {
    const write = (name: string, content: string) => {
      const f = path.join(h.tmp, name);
      fs.writeFileSync(f, content);
      return f;
    };
    expect(verifyColdBackup(write('a.json', '{"format":"other"}')).ok).toBe(false);
    expect(verifyColdBackup(write('b.json', 'not json')).problems[0]).toContain('not valid JSON');
    expect(
      verifyColdBackup(write('c.json', '{"format":"novelstudio.cold-backup","formatVersion":99}'))
        .problems[0],
    ).toContain('99');
    expect(verifyColdBackup(path.join(h.tmp, 'missing.json')).ok).toBe(false);
  });

  it('verifies the latest backup of each book through the API', async () => {
    const { book } = await buildRichBook();
    await h.api('POST', `/api/books/${book.id}/cold-backup`, { dir: backupDir });
    const res = await h.api('POST', '/api/cold-backup/verify', {});
    expect(res.json().results).toMatchObject([{ bookId: book.id, ok: true, checksum: 'ok' }]);
  });
});

describe('retention (COLD-06)', () => {
  it('never deletes by default', async () => {
    const { book } = await buildRichBook();
    for (let i = 0; i < 4; i++)
      service(h, () => new Date(T0 + i * 1000)).exportBook(book.id, { dir: backupDir });
    const folder = path.join(backupDir, fs.readdirSync(backupDir)[0]!);
    expect(fs.readdirSync(folder)).toHaveLength(8);
  });

  it('keeps the newest N of this book only, with their sidecars, and leaves other files alone', async () => {
    const { book } = await buildRichBook();
    const second = await h.createBook('Another Book');
    await h.api('PUT', '/api/settings/cold-backup', { keepNewestPerBook: 2 });

    service(h, () => new Date(T0 - 5000)).exportBook(second.id, { dir: backupDir });
    const stray = path.join(backupDir, 'notes.txt');
    fs.writeFileSync(stray, 'mine');

    // The first three share a second, so "newest" also has to respect the -N suffix.
    const written: string[] = [];
    for (let i = 0; i < 5; i++) {
      const now = new Date(T0 + (i < 3 ? 0 : i) * 1000);
      written.push(
        path.basename(service(h, () => now).exportBook(book.id, { dir: backupDir }).file),
      );
    }

    const folder = (id: string) =>
      path.join(
        backupDir,
        fs.readdirSync(backupDir).find((n) => n.endsWith(id.slice(0, 8)))!,
      );
    const left = fs
      .readdirSync(folder(book.id))
      .filter((n) => n.endsWith('.json'))
      .sort();
    expect(left).toEqual([written[3], written[4]].sort());
    expect(fs.readdirSync(folder(book.id)).filter((n) => n.endsWith('.sha256'))).toHaveLength(2);
    expect(fs.readdirSync(folder(second.id)).filter((n) => n.endsWith('.json'))).toHaveLength(1);
    expect(fs.readFileSync(stray, 'utf8')).toBe('mine');
  });
});

describe('round trip (COLD-07, PRD acceptance 13)', () => {
  it('export -> restore into an empty data directory -> export is identical except exportedAt and app', async () => {
    const { book } = await buildRichBook();
    const exported = service().exportBook(book.id, { dir: backupDir, includeSnapshots: true });
    const original = readDoc(exported.file);
    expect(original.snapshots!.length).toBeGreaterThan(0);

    other = await new Harness().start();
    const restored = restoreColdBackup(
      other.store.db,
      other.store.paths,
      fs.readFileSync(exported.file),
      {
        expectedSha256: exported.sha256,
      },
    );
    expect(restored).toMatchObject({ remapped: false, warnings: [] });
    expect(restored.book.id).toBe(book.id);

    const backupDir2 = path.join(other.tmp, 'cold');
    fs.mkdirSync(backupDir2);
    const again = service(other, () => new Date(T0 + 86_400_000)).exportBook(book.id, {
      dir: backupDir2,
      includeSnapshots: true,
    });
    const copy = readDoc(again.file);

    expect(copy.exportedAt).not.toBe(original.exportedAt);
    expect({ ...copy, exportedAt: null, app: null }).toEqual({
      ...original,
      exportedAt: null,
      app: null,
    });
    // The original file bytes are the same too except for the two allowed fields.
    expect(canonical(copy)).toEqual(canonical(original));
  });

  it('restores images to disk with the same bytes and serves them', async () => {
    const { book, ids } = await buildRichBook();
    const { file } = service().exportBook(book.id, { dir: backupDir });
    other = await new Harness().start();
    restoreColdBackup(other.store.db, other.store.paths, fs.readFileSync(file));
    const res = await other.api('GET', `/assets/${book.id}/${ids.asset}`);
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(TINY_PNG)).toBe(true);
  });

  it('restores a Chinese-structured book with its settings intact', async () => {
    const book = await h.createBook('夜雨集');
    await h.api('PATCH', `/api/books/${book.id}`, { structure: CHINESE_STRUCTURE });
    const node = await h.createNode(book.id, 'chapter', null, '重逢');
    await h.saveContent(node.id, paragraphs('她没有抬头。'), 0);
    const { file } = service().exportBook(book.id, { dir: backupDir });
    other = await new Harness().start();
    restoreColdBackup(other.store.db, other.store.paths, fs.readFileSync(file));
    expect(getBook(other.store.db, book.id)?.structure).toEqual(CHINESE_STRUCTURE);
    expect(readDoc(file).manuscript[0]!.displayTitle).toBe('第一章 重逢');
  });
});

describe('restore with ID collision (COLD-07)', () => {
  it('regenerates every id and remaps every reference, leaving the original book untouched', async () => {
    const { book, ids } = await buildRichBook();
    const exported = service().exportBook(book.id, { dir: backupDir, includeSnapshots: true });
    const original = readDoc(exported.file);
    const nodesBefore = listNodes(h.store.db, book.id);

    const result = restoreColdBackup(h.store.db, h.store.paths, fs.readFileSync(exported.file), {
      now: new Date('2026-11-02T10:00:00Z'),
    });
    expect(result.remapped).toBe(true);
    expect(result.book.id).not.toBe(book.id);
    expect(result.book.title).toBe('The Lantern Road (restored 2026-11-02)');
    expect(result.book.deletedAt).toBeNull();

    expect(listNodes(h.store.db, book.id)).toEqual(nodesBefore);
    expect(getBook(h.store.db, book.id)?.title).toBe('The Lantern Road');

    const copyDoc = readDoc(
      service(h, () => new Date(T0 + 1000)).exportBook(result.book.id, {
        dir: backupDir,
        includeSnapshots: true,
      }).file,
    );
    const originalIds = new Set(allIds(original));
    for (const id of allIds(copyDoc)) expect(originalIds.has(id)).toBe(false);
    expect(new Set(allIds(copyDoc)).size).toBe(allIds(copyDoc).length);

    // Same content and structure; only the ids (and the restored-title suffix) differ.
    const strip = (d: ColdBackupDoc) =>
      canonical({
        ...d,
        book: {
          ...d.book,
          title: '',
          updatedAt: '',
          settings: {
            ...d.book.settings,
            display: { ...(d.book.settings.display as object), backgroundImageAssetId: '' },
          },
        },
      });
    expect(strip(copyDoc)).toEqual(strip(original));

    // References: trash parents, cover, snapshot nodes all point into the new book.
    const newNodes = listNodes(h.store.db, result.book.id);
    assertTreeInvariants(newNodes);
    const newIds = new Set(newNodes.map((n) => n.id));
    expect(copyDoc.trash.find((t) => t.title === 'Cut chapter')!.originalParentId).toBe(
      copyDoc.manuscript[0]!.children[0]!.id,
    );
    expect(copyDoc.book.coverAssetId).toBe(copyDoc.assets[0]!.id);
    expect(copyDoc.assets[0]!.id).not.toBe(ids.asset);
    // The background image reference follows the remap (COLD-09).
    expect(copyDoc.book.settings.display).toMatchObject({
      backgroundImageAssetId: copyDoc.assets[1]!.id,
    });
    expect(copyDoc.assets[1]!.id).not.toBe(ids.background);
    for (const s of copyDoc.snapshots!) expect(newIds.has(s.nodeId)).toBe(true);
    expect(
      fs.existsSync(
        path.join(h.store.paths.assetsDir, result.book.id, `${copyDoc.assets[0]!.id}.png`),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(h.store.paths.assetsDir, book.id, `${ids.asset}.png`))).toBe(
      true,
    );

    // Restoring a second time still works and gets different ids again.
    const second = restoreColdBackup(h.store.db, h.store.paths, fs.readFileSync(exported.file));
    expect(second.book.id).not.toBe(result.book.id);
  });

  it('remaps when only a section id collides', async () => {
    const { book } = await buildRichBook();
    const { file } = service().exportBook(book.id, { dir: backupDir });
    const doc = readDoc(file);
    // Pretend the file is a different book that happens to reuse one section id.
    doc.book.id = crypto.randomUUID();
    const edited = Buffer.from(JSON.stringify(doc));
    expect(restoreColdBackup(h.store.db, h.store.paths, edited).remapped).toBe(true);
  });
});

describe('restore validation and safety', () => {
  const booksBefore = () =>
    (h.store.db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n;

  async function exportedDoc(): Promise<ColdBackupDoc> {
    const { book } = await buildRichBook();
    return readDoc(service().exportBook(book.id, { dir: backupDir }).file);
  }
  const restore = (doc: unknown, options = {}) =>
    restoreColdBackup(h.store.db, h.store.paths, Buffer.from(JSON.stringify(doc)), options);

  it.each([
    ['not JSON', Buffer.from('hello'), 'INVALID_BACKUP'],
    ['another JSON file', Buffer.from('{"a":1}'), 'INVALID_BACKUP'],
    [
      'a newer format version',
      Buffer.from('{"format":"novelstudio.cold-backup","formatVersion":2}'),
      'UNSUPPORTED_FORMAT_VERSION',
    ],
    ['no version', Buffer.from('{"format":"novelstudio.cold-backup"}'), 'INVALID_BACKUP'],
    [
      'a truncated document',
      Buffer.from('{"format":"novelstudio.cold-backup","formatVersion":1}'),
      'INVALID_BACKUP',
    ],
  ])('refuses %s and changes nothing', (_n, bytes, code) => {
    const before = booksBefore();
    expect(() => restoreColdBackup(h.store.db, h.store.paths, bytes)).toThrowError(
      expect.objectContaining({ code }),
    );
    expect(booksBefore()).toBe(before);
  });

  it('warns about a checksum mismatch and only continues when told to', async () => {
    const doc = await exportedDoc();
    const before = booksBefore();
    const wrong = 'a'.repeat(64);
    expect(() => restore(doc, { expectedSha256: wrong })).toThrowError(
      expect.objectContaining({ code: 'CHECKSUM_MISMATCH' }),
    );
    expect(booksBefore()).toBe(before);
    const result = restore(doc, { expectedSha256: wrong, ignoreChecksum: true });
    expect(result.warnings.join(' ')).toContain('checksum');
    expect(booksBefore()).toBe(before + 1);
  });

  it('rebuilds a section with unusable content from its plain text and says so', async () => {
    const doc = await exportedDoc();
    const ch1 = doc.manuscript[0]!.children[0]!.children[0]!;
    ch1.content = { type: 'doc', content: [{ type: 'script' }] };
    const result = restore(doc);
    expect(result.warnings.join(' ')).toContain('Reunion');
    const restoredNodes = h.store.db
      .prepare('SELECT title, plain_text, content FROM nodes WHERE book_id = ? AND title = ?')
      .all(result.book.id, 'Reunion') as { plain_text: string; content: string }[];
    expect(restoredNodes[0]!.plain_text).toBe(ch1.plainText);
    expect(JSON.parse(restoredNodes[0]!.content).type).toBe('doc');
  });

  it('skips images that are not real PNG/JPEG/WebP/GIF files (an SVG is refused)', async () => {
    const doc = await exportedDoc();
    for (const asset of doc.assets) {
      asset.dataBase64 = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ).toString('base64');
    }
    const result = restore(doc);
    expect(result.warnings.join(' ')).toContain('not a supported image type');
    expect(result.warnings.join(' ')).toContain('The background image was not available');
    expect(getBook(h.store.db, result.book.id)?.coverAssetId).toBeNull();
    expect(
      h.store.db.prepare('SELECT COUNT(*) AS n FROM assets WHERE book_id = ?').get(result.book.id),
    ).toEqual({ n: 0 });
  });

  it('keeps the file name of an asset from escaping the assets folder', async () => {
    const doc = await exportedDoc();
    doc.assets[0]!.fileName = '../../../evil.png';
    const result = restore(doc);
    const names = h.store.db
      .prepare('SELECT file_name FROM assets WHERE book_id = ?')
      .all(result.book.id) as { file_name: string }[];
    expect(names[0]!.file_name).toBe('evil.png');
  });

  it('rolls back everything when the tree breaks the rank rule, leaving no rows and no files', async () => {
    const doc = await exportedDoc();
    // A volume nested inside a chapter.
    doc.manuscript[1]!.children.push({
      ...structuredClone(doc.manuscript[0]!.children[0]!.children[0]!),
      id: crypto.randomUUID(),
      kind: 'volume',
      children: [],
    });
    const before = booksBefore();
    const assetDirs = fs.readdirSync(h.store.paths.assetsDir);
    expect(() => restore(doc)).toThrowError(expect.objectContaining({ code: 'INVALID_BACKUP' }));
    expect(booksBefore()).toBe(before);
    expect(h.store.db.prepare('SELECT COUNT(*) AS n FROM nodes').get()).toEqual({
      n: listNodes(h.store.db, doc.book.id).length,
    });
    expect(fs.readdirSync(h.store.paths.assetsDir)).toEqual(assetDirs);
  });

  it('rejects duplicate ids inside one file', async () => {
    const doc = await exportedDoc();
    doc.manuscript[1]!.id = doc.manuscript[0]!.id;
    expect(() => restore(doc)).toThrowError(expect.objectContaining({ code: 'INVALID_BACKUP' }));
  });

  it('puts a trashed section with a missing original parent at the root and warns', async () => {
    const doc = await exportedDoc();
    doc.trash[0]!.originalParentId = crypto.randomUUID();
    const result = restore(doc);
    expect(result.warnings.join(' ')).toContain('original parent');
    const row = h.store.db
      .prepare('SELECT parent_id FROM nodes WHERE book_id = ? AND title = ?')
      .get(result.book.id, doc.trash[0]!.title) as { parent_id: string | null };
    expect(row.parent_id).toBeNull();
  });

  it('recomputes plain text and word counts instead of trusting the file', async () => {
    const doc = await exportedDoc();
    const ch1 = doc.manuscript[0]!.children[0]!.children[0]!;
    ch1.wordCount = 99999;
    ch1.plainText = 'forged';
    const result = restore(doc);
    const row = h.store.db
      .prepare('SELECT plain_text, word_count FROM nodes WHERE book_id = ? AND title = ?')
      .get(result.book.id, 'Reunion') as { plain_text: string; word_count: number };
    expect(row.plain_text).toBe('The rain had stopped.\n\n她没有抬头。\n\nA third paragraph.');
    expect(row.word_count).toBe(12);
  });
});

describe('codex (COLD-09, CDX-01..06)', () => {
  const restoreDoc = (doc: unknown) =>
    restoreColdBackup(h.store.db, h.store.paths, Buffer.from(JSON.stringify(doc)));
  const countRows = (table: string, bookId: string) =>
    (
      h.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE book_id = ?`).get(bookId) as {
        n: number;
      }
    ).n;

  async function exportedCodexDoc(): Promise<ColdBackupDoc> {
    const { book } = await buildRichBook();
    return readDoc(service().exportBook(book.id, { dir: backupDir }).file);
  }

  it('exports categories and entries in their order, with templates, fields and the image id', async () => {
    const { book, ids } = await buildRichBook();
    const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);

    expect(doc.codex.categories.map((c) => [c.name, c.position])).toEqual([
      ['Characters', 0],
      ['Magic', 1],
      ['Places', 2],
      ['Era & Timeline', 3],
      ['Culture & Traditions', 4],
      ['Organizations', 5],
      ['Creatures & Species', 6],
      ['Rules & Concepts', 7],
      ['Other', 8],
    ]);
    expect(doc.codex.categories[1]!.fieldTemplate).toEqual([
      { key: 'rules', label: 'Rules', type: 'longtext' },
    ]);
    expect(doc.codex.entries.map((e) => e.title)).toEqual(['Mo Han', 'Lin Yao', 'Harbour Gate']);
    expect(doc.codex.entries.map((e) => e.position)).toEqual([0, 1, 0]);
    const lin = doc.codex.entries.find((e) => e.id === ids.codexLin)!;
    expect(lin.categoryId).toBe(ids.codexCategory);
    expect(lin.fields.map((f) => [f.key, f.label])).toEqual([
      ['name', 'Name'],
      ['aliases', 'Also known as'],
      ['f-0a1b2c3d', 'Favourite tea'],
      ['background', 'Background'],
    ]);
    expect(doc.codex.entries.find((e) => e.id === ids.codexGate)!.imageAssetId).toBe(ids.asset);
    expect(doc.stats).toMatchObject({ codexCategories: 9, codexEntries: 3 });
  });

  it('restores the codex into an empty data directory with the same ids, order and fields', async () => {
    const original = await exportedCodexDoc();
    other = await new Harness().start();
    const result = restoreColdBackup(
      other.store.db,
      other.store.paths,
      Buffer.from(JSON.stringify(original)),
    );
    expect(result).toMatchObject({ remapped: false, warnings: [] });

    const api = (await other.api('GET', `/api/books/${original.book.id}/codex`)).json();
    expect(api.categories.map((c: { id: string }) => c.id)).toEqual(
      original.codex.categories.map((c) => c.id),
    );
    const gate = api.entries.find((e: { title: string }) => e.title === 'Harbour Gate');
    expect(gate.imageUrl).toBe(`/assets/${original.book.id}/${original.book.coverAssetId}`);
    const lin = api.entries.find((e: { title: string }) => e.title === 'Lin Yao');
    expect(lin.fields[2]).toEqual({
      key: 'f-0a1b2c3d',
      label: 'Favourite tea',
      type: 'text',
      value: 'Jasmine',
    });
  });

  it('remaps category and image references on an id collision and leaves the original codex alone', async () => {
    const { book } = await buildRichBook();
    const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);
    const before = (await h.api('GET', `/api/books/${book.id}/codex`)).json();

    const result = restoreDoc(doc);
    expect(result.remapped).toBe(true);
    const copy = (await h.api('GET', `/api/books/${result.book.id}/codex`)).json();

    const oldIds = new Set([
      ...doc.codex.categories.map((c) => c.id),
      ...doc.codex.entries.map((e) => e.id),
    ]);
    const newCategoryIds = new Set<string>(copy.categories.map((c: { id: string }) => c.id));
    expect(copy.categories).toHaveLength(9);
    expect(copy.entries).toHaveLength(3);
    for (const c of copy.categories) {
      expect(oldIds.has(c.id)).toBe(false);
      expect(c.bookId).toBe(result.book.id);
    }
    for (const e of copy.entries) {
      expect(oldIds.has(e.id)).toBe(false);
      expect(newCategoryIds.has(e.categoryId)).toBe(true);
    }
    const gate = copy.entries.find((e: { title: string }) => e.title === 'Harbour Gate');
    expect(gate.imageAssetId).toEqual(expect.any(String));
    expect(gate.imageAssetId).not.toBe(book.coverAssetId);
    expect(gate.imageUrl).toBe(`/assets/${result.book.id}/${gate.imageAssetId}`);
    expect(
      fs.existsSync(path.join(h.store.paths.assetsDir, result.book.id, `${gate.imageAssetId}.png`)),
    ).toBe(true);
    expect((await h.api('GET', `/api/books/${book.id}/codex`)).json()).toEqual(before);
  });

  it('restores a backup made before the codex was used without inventing categories', async () => {
    const book = await h.createBook('Plain');
    const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);
    expect(doc.codex).toEqual({ categories: [], entries: [] });
    const result = restoreDoc(doc);
    expect(countRows('codex_categories', result.book.id)).toBe(0);
    expect(countRows('codex_entries', result.book.id)).toBe(0);
  });

  it('skips an entry whose category is missing, with a warning', async () => {
    const doc = await exportedCodexDoc();
    doc.codex.entries[0]!.categoryId = crypto.randomUUID();
    const result = restoreDoc(doc);
    expect(result.warnings.join(' ')).toContain('has no category');
    expect(countRows('codex_entries', result.book.id)).toBe(2);
  });

  it('drops an entry image that is not a real image, with a warning, keeping the entry', async () => {
    const doc = await exportedCodexDoc();
    doc.assets[0]!.dataBase64 = Buffer.from('<svg><script>alert(1)</script></svg>').toString(
      'base64',
    );
    const result = restoreDoc(doc);
    expect(result.warnings.join(' ')).toContain('Harbour Gate');
    const gate = h.store.db
      .prepare('SELECT image_asset_id FROM codex_entries WHERE book_id = ? AND title = ?')
      .get(result.book.id, 'Harbour Gate') as { image_asset_id: string | null };
    expect(gate.image_asset_id).toBeNull();
  });

  it('repairs hostile field keys and labels instead of storing them or failing', async () => {
    const doc = await exportedCodexDoc();
    const lin = doc.codex.entries.find((e) => e.title === 'Lin Yao')!;
    lin.fields = [
      { key: 'Bad Key!', label: '', type: 'text', value: 'a' },
      { key: 'bad-key-', label: 'Twin', type: 'longtext', value: 'b' },
    ];
    doc.codex.categories[0]!.fieldTemplate = [{ key: '../x', label: '  ', type: 'text' }];
    const result = restoreDoc(doc);
    expect(result.warnings.join(' ')).toContain('Lin Yao');
    const api = (await h.api('GET', `/api/books/${result.book.id}/codex`)).json();
    const stored = api.entries.find((e: { title: string }) => e.title === 'Lin Yao');
    expect(stored.fields.map((f: { key: string }) => f.key)).toEqual(['bad-key-', 'bad-key--2']);
    expect(stored.fields[0].label).toBe('bad-key-');
    expect(api.categories[0].fieldTemplate).toEqual([{ key: 'x', label: 'x', type: 'text' }]);
  });

  it('rejects duplicate category or entry ids inside one file and changes nothing', async () => {
    const doc = await exportedCodexDoc();
    const before = (h.store.db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n;
    const dupCategory = structuredClone(doc);
    dupCategory.codex.categories[1]!.id = dupCategory.codex.categories[0]!.id;
    expect(() => restoreDoc(dupCategory)).toThrowError(
      expect.objectContaining({ code: 'INVALID_BACKUP' }),
    );
    const dupEntry = structuredClone(doc);
    dupEntry.codex.entries[1]!.id = dupEntry.codex.entries[0]!.id;
    expect(() => restoreDoc(dupEntry)).toThrowError(
      expect.objectContaining({ code: 'INVALID_BACKUP' }),
    );
    expect((h.store.db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n).toBe(
      before,
    );
  });

  it('verify reports a codex stats mismatch', async () => {
    const { book } = await buildRichBook();
    const { file } = service().exportBook(book.id, { dir: backupDir });
    const tampered = readDoc(file);
    tampered.stats.codexEntries += 1;
    fs.writeFileSync(file, JSON.stringify(tampered));
    fs.rmSync(file + '.sha256');
    expect(verifyColdBackup(file).problems.join(' ')).toContain('stats.codexEntries');
  });
});

describe('story maps (COLD-09, MAP-01..08)', () => {
  const restoreDoc = (doc: unknown, harness = h) =>
    restoreColdBackup(harness.store.db, harness.store.paths, Buffer.from(JSON.stringify(doc)));
  const mapsOf = async (harness: Harness, bookId: string) =>
    (await harness.api('GET', `/api/books/${bookId}/maps`)).json<{ maps: StoryMap[] }>().maps;

  async function exportedMapDoc(): Promise<ColdBackupDoc> {
    const { book } = await buildRichBook();
    return readDoc(service().exportBook(book.id, { dir: backupDir }).file);
  }

  it('exports maps in order with nodes, edges, links, positions, viewport and the stats count', async () => {
    const { book, ids } = await buildRichBook();
    const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);
    expect(doc.maps.map((m) => [m.id, m.title, m.template, m.position])).toEqual([
      [ids.mapMain, 'Main plot', 'plot-tree', 0],
      [ids.mapBlank, 'Scratch', 'blank', 1],
    ]);
    const data = doc.maps[0]!.data as MapData;
    expect(data.nodes[0]!.data.links).toEqual([
      { type: 'node', id: ids.ch1 },
      { type: 'node', id: ids.gone },
      { type: 'codex', id: ids.codexLin },
    ]);
    expect(data.nodes[1]!.data.storyTime).toBe('Spring 1923');
    expect(data.nodes[2]!.position).toEqual({ x: 321, y: -45 });
    expect(data.edges[0]!.label).toBe('because');
    expect(data).toMatchObject({ viewport: { x: -10, y: 20, zoom: 0.75 }, layoutDirection: 'LR' });
    expect(doc.stats.maps).toBe(2);
  });

  it('restores maps into an empty data directory unchanged, with links that still resolve', async () => {
    const original = await exportedMapDoc();
    other = await new Harness().start();
    expect(restoreDoc(original, other)).toMatchObject({ remapped: false, warnings: [] });
    const maps = await mapsOf(other, original.book.id);
    expect(maps.map((m) => m.title)).toEqual(['Main plot', 'Scratch']);
    expect(maps[0]!.data).toEqual(original.maps[0]!.data);
    expect(maps.every((m) => !m.damaged)).toBe(true);
  });

  it('remaps section and codex links on an id collision and leaves the original maps alone', async () => {
    const { book, ids } = await buildRichBook();
    const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);
    const before = await mapsOf(h, book.id);

    const result = restoreDoc(doc);
    expect(result.remapped).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(await mapsOf(h, book.id)).toEqual(before);

    const copy = await mapsOf(h, result.book.id);
    expect(copy).toHaveLength(2);
    expect(copy.map((m) => m.id)).not.toContain(ids.mapMain);
    const newNodes = new Map(listNodes(h.store.db, result.book.id).map((n) => [n.title, n.id]));
    const newLin = (await h.api('GET', `/api/books/${result.book.id}/codex`))
      .json<{ entries: { id: string; title: string }[] }>()
      .entries.find((e) => e.title === 'Lin Yao')!.id;
    expect(copy[0]!.data.nodes[0]!.data.links).toEqual([
      { type: 'node', id: newNodes.get('Reunion') },
      { type: 'node', id: newNodes.get('Cut chapter') },
      { type: 'codex', id: newLin },
    ]);
    for (const link of copy[0]!.data.nodes[0]!.data.links) {
      expect([ids.ch1, ids.gone, ids.codexLin]).not.toContain(link.id);
    }
  });

  it('keeps a link whose target is not in the file and warns, so "(missing)" stays visible later', async () => {
    const doc = await exportedMapDoc();
    const lost = crypto.randomUUID();
    const data = doc.maps[0]!.data as MapData;
    data.nodes[0]!.data.links.push({ type: 'node', id: lost }, { type: 'codex', id: lost });
    other = await new Harness().start();
    const result = restoreDoc(doc, other);
    expect(result.warnings.join(' ')).toContain('2 link(s)');
    expect(result.warnings.join(' ')).toContain('(missing)');

    const restored = (await mapsOf(other, result.book.id))[0]!;
    expect(restored.data.nodes[0]!.data.links).toContainEqual({ type: 'node', id: lost });
    expect(restored.data.nodes[0]!.data.links).toContainEqual({ type: 'codex', id: lost });

    // The links survive another export, so nothing is lost on the way.
    const again = readDoc(
      service(other, () => new Date(T0 + 1000)).exportBook(result.book.id, {
        dir: path.join(other.tmp, 'cold'),
      }).file,
    );
    expect((again.maps[0]!.data as MapData).nodes[0]!.data.links).toContainEqual({
      type: 'node',
      id: lost,
    });
  });

  it('repairs damaged maps item by item with warnings instead of failing the restore', async () => {
    const doc = await exportedMapDoc();
    const data = doc.maps[0]!.data as unknown as { nodes: unknown[]; edges: unknown[] };
    const total = data.nodes.length;
    data.nodes.push({ id: 'bad', position: 'x' });
    data.edges.push({ id: 'e-bad', source: 'bad', target: 'bad', label: '' });
    doc.maps[1]!.template = 'invented';
    doc.maps[1]!.data = { nodes: 'nope' };
    other = await new Harness().start();
    const result = restoreDoc(doc, other);
    const text = result.warnings.join(' ');
    expect(text).toContain('could not be read and was left out');
    expect(text).toContain('unknown template');
    const maps = await mapsOf(other, result.book.id);
    expect(maps[0]!.data.nodes).toHaveLength(total);
    expect(maps[1]).toMatchObject({ template: 'blank', title: 'Scratch' });
    expect(maps[1]!.data.nodes).toEqual([]);
  });

  it('rejects duplicate map ids inside one file and changes nothing', async () => {
    const doc = await exportedMapDoc();
    doc.maps[1]!.id = doc.maps[0]!.id;
    const before = (h.store.db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n;
    expect(() => restoreDoc(doc)).toThrowError(expect.objectContaining({ code: 'INVALID_BACKUP' }));
    expect((h.store.db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n).toBe(
      before,
    );
  });

  it('rolls back the whole restore when a map cannot be stored', async () => {
    const doc = await exportedMapDoc();
    other = await new Harness().start();
    other.store.db.exec(
      "CREATE TRIGGER fail_maps BEFORE INSERT ON maps BEGIN SELECT RAISE(ABORT, 'boom'); END;",
    );
    expect(() => restoreDoc(doc, other!)).toThrow();
    for (const table of ['books', 'nodes', 'maps', 'codex_entries', 'assets']) {
      const n = (
        other.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
      ).n;
      expect(n, table).toBe(0);
    }
  });

  it('warns in the export when a stored map is partly unreadable, and still exports the rest', async () => {
    const { book, ids } = await buildRichBook();
    h.store.db
      .prepare('UPDATE maps SET data = ? WHERE id = ?')
      .run(JSON.stringify({ nodes: [{ id: 'x' }], edges: [] }), ids.mapBlank);
    const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);
    expect(doc.warnings.join(' ')).toContain('Map "Scratch"');
    expect(doc.maps).toHaveLength(2);
    expect(doc.maps[0]!.data).toMatchObject({ layoutDirection: 'LR' });
  });

  it('verify reports a map stats mismatch', async () => {
    const { book } = await buildRichBook();
    const { file } = service().exportBook(book.id, { dir: backupDir });
    const tampered = readDoc(file);
    tampered.stats.maps += 1;
    fs.writeFileSync(file, JSON.stringify(tampered));
    fs.rmSync(file + '.sha256');
    expect(verifyColdBackup(file).problems.join(' ')).toContain('stats.maps');
  });
});

describe('foreshadows (COLD-09, FS-01, FS-02)', () => {
  const restoreDoc = (doc: unknown, harness = h) =>
    restoreColdBackup(harness.store.db, harness.store.paths, Buffer.from(JSON.stringify(doc)));
  const threadsOf = async (harness: Harness, bookId: string) =>
    (await harness.api('GET', `/api/books/${bookId}/foreshadows`)).json<{ threads: Thread[] }>()
      .threads;

  async function exportedDoc(): Promise<ColdBackupDoc> {
    const { book } = await buildRichBook();
    return readDoc(service().exportBook(book.id, { dir: backupDir }).file);
  }

  it('exports threads with their occurrences, including sections that are in the trash', async () => {
    const { book, ids } = await buildRichBook();
    const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);
    expect(doc.foreshadows.map((f) => [f.id, f.title, f.status, f.color])).toEqual([
      [ids.threadCompass, 'The broken compass', 'planted', '#336699'],
      [ids.threadDoor, 'The red door', 'planned', '#c0841a'],
    ]);
    expect(doc.foreshadows[0]!.occurrences.map((o) => [o.nodeId, o.role])).toEqual([
      [ids.ch1, 'setup'],
      [ids.scene, 'hint'],
      [ids.prologue, 'payoff'],
    ]);
    expect(doc.foreshadows[0]!.occurrences[0]).toMatchObject({
      excerpt: 'The needle shook.',
      note: 'first look',
      anchored: false,
      anchorState: null,
    });
    expect(doc.foreshadows[1]!.occurrences.map((o) => o.nodeId)).toEqual([ids.gone, ids.nested]);
    expect(doc.stats).toMatchObject({ foreshadows: 2, occurrences: 5 });
  });

  it('restores threads into an empty data directory unchanged', async () => {
    const original = await exportedDoc();
    other = await new Harness().start();
    expect(restoreDoc(original, other)).toMatchObject({ remapped: false, warnings: [] });
    const threads = await threadsOf(other, original.book.id);
    expect(threads.map((t) => t.title)).toEqual(['The broken compass', 'The red door']);
    expect(threads[0]!.occurrences).toHaveLength(3);
    expect(threads[0]!.notes).toBe('她没有抬头。 Notes.');
  });

  it('keeps an occurrence whose section was purged (node id null) through a round trip', async () => {
    const { book, ids } = await buildRichBook();
    h.store.db.pragma('foreign_keys = OFF');
    h.store.db
      .prepare('UPDATE foreshadow_occurrences SET node_id = NULL WHERE foreshadow_id = ?')
      .run(ids.threadDoor);
    h.store.db.pragma('foreign_keys = ON');
    const exported = service().exportBook(book.id, { dir: backupDir });
    expect(readDoc(exported.file).foreshadows[1]!.occurrences.map((o) => o.nodeId)).toEqual([
      null,
      null,
    ]);
    other = await new Harness().start();
    expect(restoreDoc(readDoc(exported.file), other)).toMatchObject({
      remapped: false,
      warnings: [],
    });
    const again = readDoc(
      service(other, () => new Date(T0 + 1000)).exportBook(book.id, {
        dir: path.join(other.tmp, 'cold'),
      }).file,
    );
    expect(again.foreshadows).toEqual(readDoc(exported.file).foreshadows);
  });

  it('remaps thread, occurrence and section ids on an id collision and leaves the original alone', async () => {
    const { book, ids } = await buildRichBook();
    const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);
    const before = await threadsOf(h, book.id);

    const result = restoreDoc(doc);
    expect(result.remapped).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(await threadsOf(h, book.id)).toEqual(before);

    const copy = await threadsOf(h, result.book.id);
    expect(copy).toHaveLength(2);
    expect(copy.map((t) => t.id)).not.toContain(ids.threadCompass);
    const oldOccurrenceIds = new Set(before.flatMap((t) => t.occurrences.map((o) => o.id)));
    for (const o of copy.flatMap((t) => t.occurrences))
      expect(oldOccurrenceIds.has(o.id)).toBe(false);
    const titleOf = new Map(listNodes(h.store.db, result.book.id).map((n) => [n.id, n.title]));
    expect(copy[0]!.occurrences.map((o) => titleOf.get(o.nodeId!))).toEqual([
      'Reunion',
      'Rain',
      'Prologue',
    ]);
    expect(copy[1]!.occurrences.map((o) => titleOf.get(o.nodeId!))).toEqual([
      'Cut chapter',
      'Trashed earlier',
    ]);
    expect(copy.flatMap((t) => t.occurrences).every((o) => o.foreshadowId !== '')).toBe(true);
    expect(copy[0]!.occurrences.every((o) => o.foreshadowId === copy[0]!.id)).toBe(true);
  });

  describe('in-text anchors (FS-08)', () => {
    const anchorDoc = (occurrenceId: string) => ({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'The needle shook.',
              marks: [{ type: 'foreshadowAnchor', attrs: { occurrenceId } }],
            },
          ],
        },
      ],
    });
    const contentOf = (harness: Harness, bookId: string, title: string) =>
      harness.store.db
        .prepare('SELECT content FROM nodes WHERE book_id = ? AND title = ?')
        .get(bookId, title) as { content: string };

    async function anchoredBook() {
      const { book, ids } = await buildRichBook();
      const occurrence = (await threadsOf(h, book.id))[0]!.occurrences[0]!;
      const rev = (await h.api('GET', `/api/nodes/${ids.ch1}`)).json().node.rev as number;
      expect(
        (await h.saveContent(ids.ch1!, anchorDoc(occurrence.id) as never, rev)).statusCode,
      ).toBe(200);
      return { book, occurrence };
    }

    it('round-trips an anchor unchanged into an empty data directory', async () => {
      const { book, occurrence } = await anchoredBook();
      const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);
      other = await new Harness().start();
      expect(restoreDoc(doc, other)).toMatchObject({ remapped: false, warnings: [] });
      expect(contentOf(other, book.id, 'Reunion').content).toContain(occurrence.id);
      const restored = (await threadsOf(other, book.id))[0]!.occurrences[0]!;
      expect(restored).toMatchObject({ id: occurrence.id, anchored: true, anchorState: 'present' });
    });

    it('rewrites anchors in sections and snapshots to the new occurrence ids on an id collision', async () => {
      const { book, occurrence } = await anchoredBook();
      const doc = readDoc(
        service().exportBook(book.id, { dir: backupDir, includeSnapshots: true }).file,
      );
      const target = doc.snapshots?.[0];
      expect(target).toBeDefined();
      target!.content = anchorDoc(occurrence.id) as never;

      const result = restoreDoc(doc);
      expect(result.remapped).toBe(true);
      expect(result.warnings).toEqual([]);

      const copy = (await threadsOf(h, result.book.id))[0]!.occurrences[0]!;
      expect(copy.id).not.toBe(occurrence.id);
      expect(copy).toMatchObject({ anchored: true, anchorState: 'present' });
      const text = contentOf(h, result.book.id, 'Reunion').content;
      expect(text).toContain(copy.id);
      expect(text).not.toContain(occurrence.id);

      const snapshots = h.store.db
        .prepare(
          'SELECT s.content FROM snapshots s JOIN nodes n ON n.id = s.node_id WHERE n.book_id = ?',
        )
        .all(result.book.id) as { content: string }[];
      expect(snapshots.some((s) => s.content.includes(copy.id))).toBe(true);
      expect(snapshots.some((s) => s.content.includes(occurrence.id))).toBe(false);
      expect(contentOf(h, book.id, 'Reunion').content).toContain(occurrence.id);
    });

    it('keeps a missing anchor missing through a restore', async () => {
      const { book, occurrence } = await anchoredBook();
      h.store.db
        .prepare("UPDATE foreshadow_occurrences SET anchor_state = 'missing' WHERE id = ?")
        .run(occurrence.id);
      const doc = readDoc(service().exportBook(book.id, { dir: backupDir }).file);
      const result = restoreDoc(doc);
      expect((await threadsOf(h, result.book.id))[0]!.occurrences[0]).toMatchObject({
        anchored: true,
        anchorState: 'missing',
      });
    });
  });

  it('repairs an unknown status, a bad color and a missing section with warnings', async () => {
    const doc = await exportedDoc();
    doc.foreshadows[0]!.status = 'mystery';
    doc.foreshadows[0]!.color = 'red';
    doc.foreshadows[0]!.occurrences[1]!.nodeId = crypto.randomUUID();
    other = await new Harness().start();
    const result = restoreDoc(doc, other);
    const text = result.warnings.join(' ');
    expect(text).toContain('unknown status "mystery"');
    expect(text).toContain('invalid color');
    expect(text).toContain('1 occurrence(s) pointed to a section that is not in this backup');

    const threads = await threadsOf(other, result.book.id);
    expect(threads[0]).toMatchObject({ status: 'planned', color: '#c0841a' });
    expect(threads[0]!.occurrences.map((o) => o.nodeId === null)).toEqual([false, true, false]);
  });

  it('rejects duplicate thread or occurrence ids inside one file and changes nothing', async () => {
    const doc = await exportedDoc();
    const books = () =>
      (h.store.db.prepare('SELECT COUNT(*) AS n FROM books').get() as { n: number }).n;
    const before = books();
    const twin = structuredClone(doc);
    twin.foreshadows[1]!.id = twin.foreshadows[0]!.id;
    expect(() => restoreDoc(twin)).toThrowError(
      expect.objectContaining({ code: 'INVALID_BACKUP' }),
    );
    const twinOccurrence = structuredClone(doc);
    twinOccurrence.foreshadows[1]!.occurrences[0]!.id =
      twinOccurrence.foreshadows[0]!.occurrences[0]!.id;
    expect(() => restoreDoc(twinOccurrence)).toThrowError(
      expect.objectContaining({ code: 'INVALID_BACKUP' }),
    );
    expect(books()).toBe(before);
  });

  it('rolls back the whole restore when an occurrence cannot be stored', async () => {
    const doc = await exportedDoc();
    other = await new Harness().start();
    other.store.db.exec(
      "CREATE TRIGGER fail_occ BEFORE INSERT ON foreshadow_occurrences BEGIN SELECT RAISE(ABORT, 'boom'); END;",
    );
    expect(() => restoreDoc(doc, other!)).toThrow();
    for (const table of ['books', 'nodes', 'foreshadows', 'foreshadow_occurrences']) {
      const n = (
        other.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
      ).n;
      expect(n, table).toBe(0);
    }
  });

  it('verify reports a foreshadow stats mismatch', async () => {
    const { book } = await buildRichBook();
    const { file } = service().exportBook(book.id, { dir: backupDir });
    const tampered = readDoc(file);
    tampered.stats.occurrences += 1;
    fs.writeFileSync(file, JSON.stringify(tampered));
    fs.rmSync(file + '.sha256');
    expect(verifyColdBackup(file).problems.join(' ')).toContain('stats.occurrences');
  });
});

describe('API', () => {
  it('reads and updates the cold backup settings in config.json', async () => {
    const initial = (await h.api('GET', '/api/settings/cold-backup')).json();
    expect(initial.settings).toEqual({
      dir: null,
      keepNewestPerBook: null,
      includeSnapshots: false,
      reminderDays: 7,
      autoDaily: false,
    });
    expect(initial.last).toEqual({});
    expect(initial.autoDailyLast).toBeNull();

    const res = await h.api('PUT', '/api/settings/cold-backup', {
      dir: backupDir,
      keepNewestPerBook: 5,
      includeSnapshots: true,
      reminderDays: 3,
    });
    expect(res.json().settings).toEqual({
      dir: backupDir,
      keepNewestPerBook: 5,
      includeSnapshots: true,
      reminderDays: 3,
      autoDaily: false,
    });
    expect(readConfig(h.dataDir).coldBackup).toMatchObject({
      dir: backupDir,
      keepNewestPerBook: 5,
    });
    expect(readConfig(h.dataDir).coldBackup.autoDaily).toBe(false);

    const cleared = await h.api('PUT', '/api/settings/cold-backup', {
      keepNewestPerBook: null,
      dir: null,
    });
    expect(cleared.json().settings).toMatchObject({ dir: null, keepNewestPerBook: null });
  });

  it('rejects invalid settings', async () => {
    expect((await h.api('PUT', '/api/settings/cold-backup', {})).statusCode).toBe(400);
    expect(
      (await h.api('PUT', '/api/settings/cold-backup', { keepNewestPerBook: 0 })).statusCode,
    ).toBe(400);
    expect((await h.api('PUT', '/api/settings/cold-backup', { reminderDays: 0 })).statusCode).toBe(
      400,
    );
    const inside = await h.api('PUT', '/api/settings/cold-backup', {
      dir: path.join(h.dataDir, 'cold'),
    });
    expect(inside.statusCode).toBe(400);
    expect(inside.json().error.code).toBe('COLD_BACKUP_LOCATION_INVALID');
    expect((await h.api('PUT', '/api/settings/cold-backup', { dir: 'relative' })).statusCode).toBe(
      400,
    );
  });

  it('validates a location without creating anything', async () => {
    const ok = (
      await h.api('POST', '/api/settings/cold-backup/validate', { dir: backupDir })
    ).json();
    expect(ok).toMatchObject({ ok: true, willCreate: false });
    const create = (
      await h.api('POST', '/api/settings/cold-backup/validate', { dir: path.join(h.tmp, 'later') })
    ).json();
    expect(create).toMatchObject({ ok: true, willCreate: true });
    expect(fs.existsSync(path.join(h.tmp, 'later'))).toBe(false);
    const missing = (
      await h.api('POST', '/api/settings/cold-backup/validate', { dir: path.join(h.tmp, 'a', 'b') })
    ).json();
    expect(missing).toMatchObject({ ok: false, code: 'COLD_BACKUP_LOCATION_UNAVAILABLE' });
    const inside = (
      await h.api('POST', '/api/settings/cold-backup/validate', { dir: h.dataDir })
    ).json();
    expect(inside).toMatchObject({ ok: false, code: 'COLD_BACKUP_LOCATION_INVALID' });
  });

  it('returns the folder chosen in the picker, or null when cancelled', async () => {
    await h.cleanup();
    let answer: string | null = '/Volumes/Backup';
    h = await new Harness({ pickFolder: async () => answer }).start();
    expect((await h.api('POST', '/api/settings/cold-backup/choose-folder')).json()).toEqual({
      path: '/Volumes/Backup',
    });
    answer = null;
    expect((await h.api('POST', '/api/settings/cold-backup/choose-folder')).json()).toEqual({
      path: null,
    });
  });

  it('exports one book with the saved location and all live books', async () => {
    const a = await buildRichBook();
    const b = await h.createBook('Second');
    const trashed = await h.createBook('Trashed one');
    await h.api('DELETE', `/api/books/${trashed.id}`);
    await h.api('PUT', '/api/settings/cold-backup', { dir: backupDir });

    const one = await h.api('POST', `/api/books/${a.book.id}/cold-backup`, {});
    expect(one.statusCode).toBe(200);
    expect(one.json<{ result: ExportResult }>().result).toMatchObject({
      bookId: a.book.id,
      title: 'The Lantern Road',
    });

    const all = await h.api('POST', '/api/cold-backup/all', {});
    const results = all.json<{ results: { ok: boolean; bookId: string }[] }>().results;
    expect(results.map((r) => r.bookId).sort()).toEqual([a.book.id, b.id].sort());
    expect(results.every((r) => r.ok)).toBe(true);
    expect(Object.keys(readConfig(h.dataDir).coldBackup.last).sort()).toEqual(
      [a.book.id, b.id].sort(),
    );
    expect(fs.readdirSync(backupDir).some((n) => n.startsWith('Trashed'))).toBe(false);
  });

  it('imports a backup as a new book (IMP-01), with and without a checksum file', async () => {
    const { book } = await buildRichBook();
    const exported = service().exportBook(book.id, { dir: backupDir });
    const bytes = fs.readFileSync(exported.file);
    const sidecar = fs.readFileSync(exported.checksumFile);

    const good = multipartBody([
      { name: 'file', filename: 'b.novelstudio.json', data: bytes },
      { name: 'checksum', filename: 'b.sha256', data: sidecar },
    ]);
    const res = await h.app.inject({ method: 'POST', url: '/api/import/cold-backup', ...good });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      remapped: true,
      warnings: [],
      book: { title: expect.stringContaining('restored') },
    });

    const bad = multipartBody([
      { name: 'file', filename: 'b.json', data: bytes },
      { name: 'checksum', filename: 'b.sha256', data: 'f'.repeat(64) + '  b.json\n' },
    ]);
    const refused = await h.app.inject({ method: 'POST', url: '/api/import/cold-backup', ...bad });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('CHECKSUM_MISMATCH');

    const forced = multipartBody([
      { name: 'file', filename: 'b.json', data: bytes },
      { name: 'checksum', filename: 'b.sha256', data: 'f'.repeat(64) },
      { name: 'ignoreChecksum', data: '1' },
    ]);
    const allowed = await h.app.inject({
      method: 'POST',
      url: '/api/import/cold-backup',
      ...forced,
    });
    expect(allowed.statusCode).toBe(201);
    expect(allowed.json().warnings.join(' ')).toContain('checksum');

    const garbage = multipartBody([{ name: 'file', filename: 'x.json', data: 'nope' }]);
    expect(
      (await h.app.inject({ method: 'POST', url: '/api/import/cold-backup', ...garbage }))
        .statusCode,
    ).toBe(400);
    expect((await h.api('POST', '/api/import/cold-backup', {})).statusCode).toBe(400);
  });
});
