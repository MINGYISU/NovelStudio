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
const active = new Set<MapSaver>();

export function trackMapSaver(saver: MapSaver): () => void {
  active.add(saver);
  return () => active.delete(saver);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const saver of active) if (saver.hasUnsaved()) void saver.flush({ keepalive: true });
  });
}
