import { describe, expect, it } from 'vitest';
import { remapMapLinks, resolveMapLink, sectionTargets } from './map-links.ts';
import { emptyMapData, type MapData } from './schemas/map.ts';
import type { NodeKind } from './types.ts';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

function section(
  id: string,
  title: string,
  position: number,
  deletedAt: string | null = null,
  kind: NodeKind = 'chapter',
) {
  return { id, bookId: 'b1', parentId: null, kind, title, position, numbered: true, deletedAt };
}

describe('link labels (MAP-07)', () => {
  const entries = new Map([[C, 'Lin Yao']]);

  it('shows the current display title, so a rename or a move changes the label', () => {
    const before = sectionTargets([section(A, 'Arrival', 0), section(B, 'Storm', 1)]);
    expect(resolveMapLink({ type: 'node', id: B }, before, entries)).toEqual({
      label: 'Chapter 2 — Storm',
      state: 'ok',
    });

    const renamed = sectionTargets([section(A, 'Arrival', 0), section(B, 'The Storm', 1)]);
    expect(resolveMapLink({ type: 'node', id: B }, renamed, entries).label).toBe(
      'Chapter 2 — The Storm',
    );

    const moved = sectionTargets([section(B, 'The Storm', 0), section(A, 'Arrival', 1)]);
    expect(resolveMapLink({ type: 'node', id: B }, moved, entries).label).toBe(
      'Chapter 1 — The Storm',
    );
  });

  it('marks a trashed section as in the trash and does not count it for numbering', () => {
    const targets = sectionTargets([
      section(A, 'Arrival', 0, '2026-01-01T00:00:00.000Z'),
      section(B, 'Storm', 1),
    ]);
    expect(resolveMapLink({ type: 'node', id: A }, targets, entries)).toEqual({
      label: 'Arrival (in trash)',
      state: 'trashed',
    });
    expect(resolveMapLink({ type: 'node', id: B }, targets, entries).label).toBe(
      'Chapter 1 — Storm',
    );
  });

  it('shows (missing) for an unknown section or codex entry, and the entry title otherwise', () => {
    const targets = sectionTargets([section(A, 'Arrival', 0)]);
    expect(resolveMapLink({ type: 'node', id: C }, targets, entries)).toEqual({
      label: '(missing)',
      state: 'missing',
    });
    expect(resolveMapLink({ type: 'codex', id: A }, targets, entries).state).toBe('missing');
    expect(resolveMapLink({ type: 'codex', id: C }, targets, entries)).toEqual({
      label: 'Lin Yao',
      state: 'ok',
    });
  });

  it('names an untitled unnumbered section', () => {
    const targets = sectionTargets([{ ...section(A, '', 0), numbered: false }]);
    expect(resolveMapLink({ type: 'node', id: A }, targets, entries).label).toBe('(untitled)');
  });
});

describe('remapMapLinks', () => {
  it('rewrites known ids and keeps unknown ones', () => {
    const data: MapData = {
      ...emptyMapData(),
      nodes: [
        {
          id: 'n1',
          position: { x: 0, y: 0 },
          data: {
            title: 't',
            description: '',
            color: '#112233',
            storyTime: '',
            links: [
              { type: 'node', id: A },
              { type: 'codex', id: C },
            ],
          },
        },
      ],
    };
    const out = remapMapLinks(data, (id) => (id === A ? B : undefined));
    expect(out.nodes[0]!.data.links).toEqual([
      { type: 'node', id: B },
      { type: 'codex', id: C },
    ]);
    expect(data.nodes[0]!.data.links[0]!.id).toBe(A);
  });
});
