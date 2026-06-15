import { describe, it, expect, vi } from "vitest";
import { withRetry, isTransient } from "../src/retry.js";

describe("isTransient", () => {
  it("flags transient errors", () => {
    expect(isTransient(new Error("network timeout"))).toBe(true);
    expect(isTransient(new Error("rate limit"))).toBe(true);
  });
  it("ignores deterministic errors", () => {
    expect(isTransient(new Error("execution reverted"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("succeeds without retry", async () => {
    const fn = vi.fn(async () => 1);
    expect(await withRetry(fn, { baseDelay: 1 })).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("retries then succeeds", async () => {
    let n = 0;
    const fn = vi.fn(async () => { if (++n < 2) throw new Error("timeout"); return "ok"; });
    expect(await withRetry(fn, { retries: 3, baseDelay: 1 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("rethrows non-transient immediately", async () => {
    const fn = vi.fn(async () => { throw new Error("reverted"); });
    await expect(withRetry(fn, { retries: 3, baseDelay: 1 })).rejects.toThrow(/reverted/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
