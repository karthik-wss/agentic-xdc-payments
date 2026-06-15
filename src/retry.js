/**
 * Exponential-backoff retry for transient RPC failures (CLI).
 *
 * Use ONLY for idempotent reads (balances, quotes, allowance, estimateGas).
 * Never wrap a broadcast — a retry after a tx that actually landed double-sends.
 */

const TRANSIENT = [
  "timeout",
  "network",
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
  "rate limit",
  "429",
  "503",
  "502",
  "bad gateway",
  "server_error",
];

export function isTransient(err) {
  const msg = (err?.shortMessage || err?.message || String(err)).toLowerCase();
  const code = (err?.code || "").toString().toLowerCase();
  if (code === "timeout" || code === "network_error" || code === "server_error") return true;
  return TRANSIENT.some((t) => msg.includes(t));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withRetry(fn, { retries = 3, baseDelay = 250 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isTransient(err)) throw err;
      await sleep(baseDelay * 2 ** attempt);
    }
  }
  throw lastErr;
}
