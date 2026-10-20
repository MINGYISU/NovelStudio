import type { ContentDoc } from '../../../shared/schemas/content.ts';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'stale';

export interface SaveResult {
  rev: number;
  wordCount: number;
}

/** Thrown by a transport: `stale` for a 409 revision conflict, otherwise a failure (maybe retryable). */
export class SaveError extends Error {
  override name = 'SaveError';

  constructor(
    readonly kind: 'stale' | 'failed',
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}

export interface SaveTransport {
  save(
    nodeId: string,
    content: ContentDoc,
    rev: number,
    options: { keepalive: boolean },
  ): Promise<SaveResult>;
}

export interface TimerApi {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface SaverDeps {
  transport: SaveTransport;
  onChange?: () => void;
  onSaved?: (nodeId: string, result: SaveResult) => void;
  debounceMs?: number;
  retryMs?: number;
  timers?: TimerApi;
}

export const DEBOUNCE_MS = 1000;
export const RETRY_MS = 5000;

/**
 * Saves one section's text (ED-05, ED-07, ARCHITECTURE §8): debounced, one request in flight at a
 * time, the newest text always wins, a revision conflict stops saving for good until a reload, and
 * a failure keeps the text and retries. Text is never dropped without having been saved.
 */
export class SectionSaver {
  rev: number;
  state: SaveState = 'saved';
  error: string | null = null;

  private pending: ContentDoc | null = null;
  private timer: unknown = null;
  private inflight: Promise<void> | null = null;
  private flushing = false;
  private keepalive = false;
  private readonly debounceMs: number;
  private readonly retryMs: number;
  private readonly timers: TimerApi;

  constructor(
    readonly nodeId: string,
    rev: number,
    private readonly deps: SaverDeps,
  ) {
    this.rev = rev;
    this.debounceMs = deps.debounceMs ?? DEBOUNCE_MS;
    this.retryMs = deps.retryMs ?? RETRY_MS;
    this.timers = deps.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
  }

  /** Text that has not reached the server (also kept after an error or a conflict). */
  unsavedContent(): ContentDoc | null {
    return this.pending;
  }

  /** Records new text and schedules the save. */
  update(content: ContentDoc): void {
    this.pending = content;
    if (this.state === 'stale') return;
    this.setState(this.inflight ? 'saving' : 'dirty');
    this.schedule(this.debounceMs);
  }

  /** Saves now. Resolves when nothing is left to send, or when saving stopped (error or conflict). */
  flush(options: { keepalive?: boolean } = {}): Promise<void> {
    this.cancelTimer();
    if (options.keepalive) this.keepalive = true;
    if (this.state === 'stale') return this.inflight ?? Promise.resolve();
    this.flushing = true;
    return this.run();
  }

  /** Adopts the server's current state after a reload; drops any local unsaved text. */
  reset(rev: number): void {
    this.cancelTimer();
    this.rev = rev;
    this.pending = null;
    this.error = null;
    this.setState('saved');
  }

  dispose(): void {
    this.cancelTimer();
  }

  private run(): Promise<void> {
    if (this.inflight) return this.inflight;
    const loop = async (): Promise<void> => {
      while (this.pending && this.flushing && this.state !== 'stale') {
        const content = this.pending;
        this.pending = null;
        this.setState('saving');
        try {
          const result = await this.deps.transport.save(this.nodeId, content, this.rev, {
            keepalive: this.keepalive,
          });
          this.rev = result.rev;
          this.error = null;
          this.deps.onSaved?.(this.nodeId, result);
        } catch (err) {
          this.pending = this.pending ?? content;
          const failure =
            err instanceof SaveError ? err : new SaveError('failed', (err as Error).message);
          this.error = failure.message;
          if (failure.kind === 'stale') {
            this.setState('stale');
          } else {
            this.setState('error');
            if (failure.retryable) this.schedule(this.retryMs);
          }
          return;
        }
      }
      if (this.state !== 'stale' && this.state !== 'error') {
        this.setState(this.pending ? 'dirty' : 'saved');
      }
    };
    this.inflight = loop().finally(() => {
      this.inflight = null;
      this.flushing = false;
      this.keepalive = false;
    });
    return this.inflight;
  }

  private schedule(ms: number): void {
    this.cancelTimer();
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  private setState(state: SaveState): void {
    if (this.state === state) return;
    this.state = state;
    this.deps.onChange?.();
  }
}

export type OverallStatus =
  { kind: 'saved' } | { kind: 'saving' } | { kind: 'error'; message: string } | { kind: 'stale' };

/** One saver per section, so text typed in a section stays safe while the user is in another. */
export class SaverRegistry {
  private readonly savers = new Map<string, SectionSaver>();
  private readonly listeners = new Set<() => void>();
  private readonly savedListeners = new Set<(nodeId: string, result: SaveResult) => void>();

  constructor(private readonly base: Omit<SaverDeps, 'onChange' | 'onSaved'>) {}

  get(nodeId: string): SectionSaver | undefined {
    return this.savers.get(nodeId);
  }

  /** The saver for a section, created at the revision the editor was loaded with. */
  getOrCreate(nodeId: string, rev: number): SectionSaver {
    let saver = this.savers.get(nodeId);
    if (!saver) {
      saver = new SectionSaver(nodeId, rev, {
        ...this.base,
        onChange: () => this.emit(),
        onSaved: (id, result) => this.savedListeners.forEach((fn) => fn(id, result)),
      });
      this.savers.set(nodeId, saver);
    }
    return saver;
  }

  /** Forgets a section's saver (and any unsaved text) so the next open starts from the server. */
  drop(nodeId: string): void {
    this.savers.get(nodeId)?.dispose();
    this.savers.delete(nodeId);
    this.emit();
  }

  flushAll(options: { keepalive?: boolean } = {}): Promise<void[]> {
    return Promise.all([...this.savers.values()].map((s) => s.flush(options)));
  }

  status(): OverallStatus {
    let saving = false;
    let error: string | null = null;
    for (const saver of this.savers.values()) {
      if (saver.state === 'stale') return { kind: 'stale' };
      if (saver.state === 'error') error = saver.error ?? 'The text could not be saved.';
      if (saver.state === 'saving' || saver.state === 'dirty') saving = true;
    }
    if (error !== null) return { kind: 'error', message: error };
    return saving ? { kind: 'saving' } : { kind: 'saved' };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onSaved(listener: (nodeId: string, result: SaveResult) => void): () => void {
    this.savedListeners.add(listener);
    return () => this.savedListeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}
