/**
 * Per-visitor HTTP rate limiting — OFF unless RATE_LIMIT_PER_MIN > 0.
 *
 * Keyed on metrics.clientIp(), which resolves the real visitor only when
 * TRUSTED_PROXY_HOPS matches the number of proxies in front of this service.
 * Until that env is set correctly, every visitor arriving through the
 * main-site proxy shares one apparent IP — enabling this with the wrong hop
 * count would throttle all proxied visitors together. Set both at once
 * (see RAILWAY_DEPLOY.md).
 *
 * Fixed-window counters in memory. One process, modest traffic: no store
 * needed. Windows can admit up to ~2x the limit across a boundary — fine for
 * scraping/abuse damping, wrong for hard quotas.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the key's window resets; 0 when allowed. */
  retryAfterSeconds: number;
}

export class RateLimiter {
  private buckets = new Map<string, { start: number; n: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 50_000,
  ) {}

  check(key: string): RateLimitResult {
    const t = this.now();
    const b = this.buckets.get(key);
    if (!b || t - b.start >= this.windowMs) {
      // Bound the map against key-spraying before it grows unbounded.
      if (this.buckets.size >= this.maxKeys) this.sweep(t);
      this.buckets.set(key, { start: t, n: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    b.n += 1;
    if (b.n <= this.limit) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((b.start + this.windowMs - t) / 1000)) };
  }

  private sweep(t: number): void {
    for (const [k, b] of this.buckets) if (t - b.start >= this.windowMs) this.buckets.delete(k);
  }
}

/** Requests-per-minute cap from the environment; <= 0 or unset disables. */
export function configuredLimit(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(0, Number.parseInt(env.RATE_LIMIT_PER_MIN ?? "0", 10) || 0);
}
