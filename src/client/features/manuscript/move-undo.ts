/** Where the single undoable move lives (the workspace store in the app). */
export interface UndoSlot<T> {
  get(): T | null;
  set(entry: T | null): void;
}

/**
 * Records a move's undo entry before the move is sent (MOVE-11). If the move then fails, the
 * previous entry comes back, but only while this move's entry is still the current one: a newer
 * move started meanwhile owns the slot and keeps its own entry.
 */
export function recordMoveUndo<T extends object>(slot: UndoSlot<T>, entry: T): { failed(): void } {
  const previous = slot.get();
  slot.set(entry);
  return {
    failed() {
      if (slot.get() === entry) slot.set(previous);
    },
  };
}
