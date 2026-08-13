// Lightweight in-memory fixed-window rate limiter for Next.js App Router API
// routes. Serverless deployments would need Redis-based limiting; this app runs
// as a long-lived Node server so a per-process Map is acceptable and cheap.
// Note: each node process enforces its own window (no cross-process sharing).

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60 * 1000;

export interface RateLimitOptions {
  limit?: number; // max requests per window
  windowMs?: number;
  key?: string; // optional prefix, defaults to the action name
}

export function isRateLimited(key: string, limit: number, windowMs: number = WINDOW_MS): boolean {
  const now = Date.now();
  const fullKey = `${key}:${now - (now % windowMs)}`;
  const bucket = buckets.get(fullKey);
  if (!bucket || bucket.windowStart + windowMs < now) {
    buckets.set(fullKey, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

/** Periodic sweep so the Map cannot grow unbounded. */
export function sweepRateLimitBuckets(): void {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.windowStart + WINDOW_MS < now) buckets.delete(k);
  }
}

setInterval(sweepRateLimitBuckets, 10 * WINDOW_MS).unref?.();
