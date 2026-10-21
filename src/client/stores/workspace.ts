import { create } from 'zustand';

const SIDEBAR_KEY = 'novelstudio.sidebarWidth';
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 300;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width)));
}

function readSidebarWidth(): number {
  try {
    const raw = Number(localStorage.getItem(SIDEBAR_KEY));
    return Number.isFinite(raw) && raw > 0 ? clampSidebarWidth(raw) : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

export interface Notice {
  id: number;
  /** When the notice was raised (ms since the epoch). */
  at: number;
  tone: 'error' | 'info';
  message: string;
  action?: { label: string; run: () => void };
}

/** Where a section was before its last move; undoing moves it back (MOVE-11, single level). */
export interface UndoableMove {
  bookId: string;
  nodeId: string;
  parentId: string | null;
  index: number;
}

interface WorkspaceState {
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  notice: Notice | null;
  notify: (notice: Omit<Notice, 'id' | 'at'>) => void;
  dismissNotice: () => void;
  lastMove: UndoableMove | null;
  setLastMove: (move: UndoableMove | null) => void;
  /** A freshly created section whose title should open for inline rename. */
  pendingEditId: string | null;
  setPendingEditId: (id: string | null) => void;
  /** The section last open per book, so the Manuscript tab returns to it after a visit elsewhere. */
  lastNodeByBook: Record<string, string>;
  setLastNode: (bookId: string, nodeId: string) => void;
  /** The story map last open per book, so the Story Maps tab returns to it. */
  lastMapByBook: Record<string, string>;
  setLastMap: (bookId: string, mapId: string) => void;
}

let noticeCounter = 0;

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  sidebarWidth: readSidebarWidth(),
  setSidebarWidth: (width) => {
    const next = clampSidebarWidth(width);
    try {
      localStorage.setItem(SIDEBAR_KEY, String(next));
    } catch {
      // Width is a convenience only; ignore storage failures.
    }
    set({ sidebarWidth: next });
  },
  notice: null,
  notify: (notice) => set({ notice: { ...notice, id: ++noticeCounter, at: Date.now() } }),
  dismissNotice: () => set({ notice: null }),
  lastMove: null,
  setLastMove: (lastMove) => set({ lastMove }),
  pendingEditId: null,
  setPendingEditId: (pendingEditId) => set({ pendingEditId }),
  lastNodeByBook: {},
  setLastNode: (bookId, nodeId) =>
    set((state) => ({ lastNodeByBook: { ...state.lastNodeByBook, [bookId]: nodeId } })),
  lastMapByBook: {},
  setLastMap: (bookId, mapId) =>
    set((state) => ({ lastMapByBook: { ...state.lastMapByBook, [bookId]: mapId } })),
}));
