import { describe, it, expect, beforeEach } from "vitest";
import { take, reset } from "../src/ratelimit.js";

beforeEach(() => reset());

describe("take (token bucket)", () => {
  it("allows up to capacity then blocks", () => {
    const opts = { capacity: 3, refillPerSec: 0 };
    expect(take("k", opts).allowed).toBe(true);
    expect(take("k", opts).allowed).toBe(true);
    expect(take("k", opts).allowed).toBe(true);
    const blocked = take("k", opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks buckets independently", () => {
    const opts = { capacity: 1, refillPerSec: 0 };
    expect(take("a", opts).allowed).toBe(true);
    expect(take("b", opts).allowed).toBe(true);
    expect(take("a", opts).allowed).toBe(false);
  });
});
