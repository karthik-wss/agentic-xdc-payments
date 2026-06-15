/**
 * Lightweight in-memory token-bucket rate limiter for the CLI.
 *
 * The CLI is single-user and single-process, so this is a best-effort guard
 * against accidental hammering of the Anthropic API and the RPC endpoint (e.g. a
 * pasted script in a loop) — NOT a multi-instance limiter. Buckets refill
 * continuously at `ratePerSec`.
 */

const buckets = new Map();

/**
 * @param {string} key            - bucket name (e.g. "parse", "send")
 * @param {{ capacity?: number, refillPerSec?: number }} [opts]
 * @returns {{ allowed: boolean, retryAfterMs: number }}
 */
export function take(key, { capacity = 10, refillPerSec = 1 } = {}) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: capacity, last: now, capacity, refillPerSec };
    buckets.set(key, b);
  }
  // Refill based on elapsed time.
  const elapsedSec = (now - b.last) / 1000;
  b.tokens = Math.min(b.capacity, b.tokens + elapsedSec * b.refillPerSec);
  b.last = now;

  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }
  const deficit = 1 - b.tokens;
  return { allowed: false, retryAfterMs: Math.ceil((deficit / b.refillPerSec) * 1000) };
}

/** Test/maintenance helper — clears all buckets. */
export function reset() {
  buckets.clear();
}
