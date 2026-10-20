import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../../shared/types.ts';
import { initialOpenState, loadOpenState, saveOpenState } from './fold-state.ts';

function section(id: string, kind: TreeNode['kind']): TreeNode {
  return {
    id,
    bookId: 'b',
    parentId: null,
    kind,
    title: id,
    position: 0,
    numbered: true,
    status: 'draft',
    synopsis: '',
    wordCount: 0,
    deletedAt: null,
  };
}

const nodes = [section('v', 'volume'), section('p', 'part'), section('c', 'chapter')];

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('fold state (TREE-07)', () => {
  it('opens volumes and parts but not chapters on the first visit', () => {
    expect(initialOpenState('book', nodes)).toEqual({ v: true, p: true, c: false });
  });

  it('restores what was saved, per book', () => {
    saveOpenState('book', { v: false, p: true, c: true }, nodes);
    expect(initialOpenState('book', nodes)).toEqual({ v: false, p: true, c: true });
    expect(initialOpenState('other', nodes)).toEqual({ v: true, p: true, c: false });
  });

  it('drops ids of sections that no longer exist', () => {
    saveOpenState('book', { v: true, ghost: true }, nodes);
    expect(loadOpenState('book')).toEqual({ v: true });
  });

  it('ignores corrupt saved state', () => {
    localStorage.setItem('novelstudio.tree.open.book', '{not json');
    expect(loadOpenState('book')).toBeNull();
    localStorage.setItem('novelstudio.tree.open.book', '{"v":"yes"}');
    expect(loadOpenState('book')).toBeNull();
  });
});
