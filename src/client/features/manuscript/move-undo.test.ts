import { describe, expect, it } from 'vitest';
import { recordMoveUndo, type UndoSlot } from './move-undo.ts';

interface Entry {
  nodeId: string;
  parentId: string | null;
  index: number;
}

function slot(initial: Entry | null = null): UndoSlot<Entry> & { value: Entry | null } {
  return {
    value: initial,
    get() {
      return this.value;
    },
    set(entry) {
      this.value = entry;
    },
  };
}

describe('recordMoveUndo (MOVE-11)', () => {
  it('puts the previous entry back when the only move in flight fails', () => {
    const older: Entry = { nodeId: 'x', parentId: null, index: 0 };
    const s = slot(older);
    const a = recordMoveUndo(s, { nodeId: 'a', parentId: null, index: 1 });
    a.failed();
    expect(s.value).toBe(older);
  });

  it('keeps the newer move when an earlier move in flight fails, so undo moves B back', () => {
    const s = slot({ nodeId: 'x', parentId: null, index: 0 });
    const entryB: Entry = { nodeId: 'b', parentId: 'p1', index: 2 };
    const a = recordMoveUndo(s, { nodeId: 'a', parentId: null, index: 1 });
    recordMoveUndo(s, entryB);
    a.failed();
    expect(s.value).toBe(entryB);
    expect(s.value).toEqual({ nodeId: 'b', parentId: 'p1', index: 2 });
  });

  it('does not bring an entry back after undo already used it', () => {
    const s = slot(null);
    const a = recordMoveUndo(s, { nodeId: 'a', parentId: null, index: 1 });
    s.set(null);
    a.failed();
    expect(s.value).toBeNull();
  });
});
