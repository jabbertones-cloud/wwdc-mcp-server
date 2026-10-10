/**
 * Optional-service degradation helper.
 *
 * Extracted from the local-embeddings service (services/embeddings.ts): an
 * optional capability whose initialization can fail — missing model, no
 * network, cold cache — must never take its caller down with it.
 *
 * The pattern:
 *  - probe: availability is resolved lazily, once, then cached. The verdict
 *    is tri-state (unknown / available / unavailable); asking is cheap.
 *  - call: `get()` returns the resource or null. It never throws, so callers
 *    degrade to their fallback path (e.g. FTS-only search) instead of
 *    crashing.
 *  - caveat: the first failure is reported exactly once per process through
 *    `onUnavailable`, so operators learn the capability is degraded without
 *    log spam on every call.
 *  - reset: clears the cached verdict so a later call may retry
 *    initialization (e.g. after the underlying problem is fixed).
 */

export interface OptionalServiceOptions<T> {
  /** Short name for the service; useful in logs and tests. */
  name: string;
  /** Initialize the resource. Throwing (or rejecting) marks it unavailable. */
  init: () => Promise<T>;
  /**
   * Called exactly once, when initialization first fails, with the error
   * message. Defaults to a single console.error caveat.
   */
  onUnavailable?: (message: string) => void;
}

export class OptionalService<T> {
  private resource: T | null = null;
  private available: boolean | null = null;
  private failureReported = false;
  private inflight: Promise<T | null> | null = null;

  constructor(private readonly options: OptionalServiceOptions<T>) {}

  /** Cached verdict without triggering initialization: null while unknown. */
  get availability(): boolean | null {
    return this.available;
  }

  /** Null-safe access: the resource, or null when unavailable. Never throws. */
  async get(): Promise<T | null> {
    if (this.resource) return this.resource;
    if (this.available === false) return null;
    // Share one in-flight initialization: a slow first load (e.g. a large
    // local model download) must not be started twice by concurrent or
    // repeated callers while it is still running.
    if (!this.inflight) {
      this.inflight = (async () => {
        try {
          this.resource = await this.options.init();
          this.available = true;
          return this.resource;
        } catch (err) {
          this.available = false;
          if (!this.failureReported) {
            this.failureReported = true;
            const message = err instanceof Error ? err.message : String(err);
            if (this.options.onUnavailable) {
              this.options.onUnavailable(message);
            } else {
              console.error(
                `[optional-service] ${this.options.name} unavailable; dependent features degraded for this process: ${message}`,
              );
            }
          }
          return null;
        } finally {
          this.inflight = null;
        }
      })();
    }
    return this.inflight;
  }

  /**
   * Time-bounded access for request paths that must not hang: resolves to
   * the resource if initialization completes within `timeoutMs`, otherwise
   * null so the caller can take its fallback. Timing out does NOT mark the
   * service unavailable and does NOT cancel the underlying load — a later
   * call can still pick the resource up once initialization finishes.
   */
  async getBounded(timeoutMs: number): Promise<T | null> {
    if (this.resource) return this.resource;
    if (this.available === false) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.get(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), Math.max(0, timeoutMs));
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Cached probe: the remembered verdict, or initializes on first ask. */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    return (await this.get()) !== null;
  }

  /** Clear the cached verdict so the next call retries initialization. */
  reset(): void {
    this.resource = null;
    this.available = null;
    this.failureReported = false;
    this.inflight = null;
  }
}
