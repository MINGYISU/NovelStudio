import type { MapData } from '../../../shared/schemas/map.ts';

export type MapSaveState = 'saved' | 'dirty' | 'saving' | 'error';

export interface MapSaveTransport {
  save(mapId: string, data: MapData, options: { keepalive: boolean }): Promise<void>;
}

export interface MapSaverDeps {
  transport: MapSaveTransport;
  onChange?: (saver: MapSaver) => void;
  debounceMs?: number;
  retryMs?: number;
}

export const MAP_DEBOUNCE_MS = 800;
export const MAP_RETRY_MS = 5000;

/**
 * Saves one map (MAP-08): debounced, one request in flight, the newest data always wins. A failure
 * keeps the data and retries; an answer that would fail again stops until the next change.
 */
export class MapSaver {
  state: MapSaveState = 'saved';
  error: string | null = null;

  private pending: MapData | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private keepalive = false;

  constructor(
    readonly mapId: string,
    private readonly deps: MapSaverDeps,
  ) {}

  update(data: MapData): void {
    this.pending = data;
    this.error = null;
    this.setState(this.inflight ? 'saving' : 'dirty');
    this.schedule(this.deps.debounceMs ?? MAP_DEBOUNCE_MS);
  }

  /** Saves now; resolves when nothing is left to send or saving failed. */
  flush(options: { keepalive?: boolean } = {}): Promise<void> {
    this.cancelTimer();
    if (options.keepalive) this.keepalive = true;
    return this.run();
  }

  hasUnsaved(): boolean {
    return this.pending !== null || this.inflight !== null;
  }

  dispose(): void {
    this.cancelTimer();
  }

  private run(): Promise<void> {
    if (this.inflight) return this.inflight;
    const loop = async (): Promise<void> => {
      while (this.pending) {
        const data = this.pending;
        this.pending = null;
        this.setState('saving');
        try {
          await this.deps.transport.save(this.mapId, data, { keepalive: this.keepalive });
          this.error = null;
        } catch (err) {
          this.pending = this.pending ?? data;
          this.error = (err as Error).message;
          this.setState('error');
          if ((err as { retryable?: boolean }).retryable !== false) {
            this.schedule(this.deps.retryMs ?? MAP_RETRY_MS);
          }
          return;
        }
      }
      this.setState('saved');
    };
    this.inflight = loop().finally(() => {
      this.inflight = null;
      this.keepalive = false;
    });
    return this.inflight;
  }

  private schedule(ms: number): void {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private setState(state: MapSaveState): void {
    if (this.state === state) return;
    this.state = state;
    this.deps.onChange?.(this);
  }
}

// Unmounting flushes in the normal way; `pagehide` is the last chance, so it asks for keepalive.
// A released saver (its map was closed) stays listed until everything it holds is saved, so
// leaving the page still warns about a map that failed to save (ED-12). Holds are counted because
// a remount (React StrictMode) can track the same saver again before the old release arrives.
const active = new Set<MapSaver>();
const holds = new Map<MapSaver, number>();

function prune(): void {
  for (const saver of active) {
    if ((holds.get(saver) ?? 0) === 0 && saver.state === 'saved' && !saver.hasUnsaved()) {
      active.delete(saver);
      holds.delete(saver);
    }
  }
}

/** Lists the saver of an open map; call the returned function once the map closed and was flushed. */
export function trackMapSaver(saver: MapSaver): () => void {
  active.add(saver);
  holds.set(saver, (holds.get(saver) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds.set(saver, Math.max(0, (holds.get(saver) ?? 1) - 1));
    prune();
  };
}

/** Savers of open maps, and of closed maps that still hold unsaved data. */
export function mapSavers(): MapSaver[] {
  prune();
  return [...active];
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const saver of active) if (saver.hasUnsaved()) void saver.flush({ keepalive: true });
  });
}
