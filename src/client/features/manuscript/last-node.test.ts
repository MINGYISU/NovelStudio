import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../../shared/types.ts';
import { loadLastNode, rememberedSection, saveLastNode } from './last-node.ts';

function section(id: string, parentId: string | null, extra: Partial<TreeNode> = {}): TreeNode {
  return {
    id,
    bookId: 'b',
    parentId,
    kind: parentId ? 'chapter' : 'part',
    title: id,
    position: 0,
    numbered: true,
    status: 'draft',
    synopsis: '',
    wordCount: 0,
    deletedAt: null,
    ...extra,
  };
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});

describe('last opened section (WS-02)', () => {
  it('is stored per book under its own key', () => {
    saveLastNode('b1', 'n1');
    saveLastNode('b2', 'n2');
    expect(loadLastNode('b1')).toBe('n1');
    expect(loadLastNode('b2')).toBe('n2');
    expect(localStorage.getItem('novelstudio:lastNode:b1')).toBe('n1');
    expect(loadLastNode('b3')).toBeNull();
  });

  it('is only offered while the section is live', () => {
    saveLastNode('b', 'c');
    expect(rememberedSection('b', [section('p', null), section('c', 'p')])).toBe('c');
    const trashed = [section('p', null), section('c', 'p', { deletedAt: '2026-01-01T00:00:00Z' })];
    expect(rememberedSection('b', trashed)).toBeNull();
    const parentTrashed = [
      section('p', null, { deletedAt: '2026-01-01T00:00:00Z' }),
      section('c', 'p'),
    ];
    expect(rememberedSection('b', parentTrashed)).toBeNull();
    expect(rememberedSection('b', [section('p', null)])).toBeNull();
  });

  it('survives a storage that refuses access', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => saveLastNode('b', 'n')).not.toThrow();
    expect(loadLastNode('b')).toBeNull();
  });
});
