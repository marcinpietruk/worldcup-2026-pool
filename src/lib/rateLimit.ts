// Tiny in-memory sliding-window limiter for failed-credential attempts.
// Keyed per player/name, it caps PIN guessing. (Per-process — fine for a single
// instance; a multi-instance deploy would move this to Redis.)
type Entry = { count: number; first: number };
const fails = new Map<string, Entry>();

const WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 8;

export function isRateLimited(key: string): boolean {
  const e = fails.get(key);
  if (!e) return false;
  if (Date.now() - e.first > WINDOW_MS) {
    fails.delete(key);
    return false;
  }
  return e.count >= MAX_FAILS;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const e = fails.get(key);
  if (!e || now - e.first > WINDOW_MS) fails.set(key, { count: 1, first: now });
  else e.count++;
}

export function clearFailures(key: string): void {
  fails.delete(key);
}
