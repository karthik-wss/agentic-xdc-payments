import { describe, it, expect, beforeAll } from "vitest";

let resolveToken, listTokens;

beforeAll(async () => {
  // REGISTRY is built from env at module load — set env first, then import.
  process.env.USDC_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000001";
  process.env.TOKENS = "XTT:0x0000000000000000000000000000000000000002,BAD:not-an-address";
  ({ resolveToken, listTokens } = await import("../src/tokens.js"));
});

describe("resolveToken", () => {
  it("always resolves native XDC", () => {
    expect(resolveToken("XDC")).toMatchObject({ symbol: "XDC", native: true });
  });
  it("is case-insensitive", () => {
    expect(resolveToken("xdc").symbol).toBe("XDC");
    expect(resolveToken("usdc").symbol).toBe("USDC");
  });
  it("resolves a TOKENS extra", () => {
    expect(resolveToken("XTT")).toMatchObject({ symbol: "XTT", native: false });
  });
  it("returns null for unknown / empty", () => {
    expect(resolveToken("NOPE")).toBeNull();
    expect(resolveToken("")).toBeNull();
    expect(resolveToken(null)).toBeNull();
  });
  it("skips a malformed TOKENS entry", () => {
    expect(resolveToken("BAD")).toBeNull();
  });
});

describe("listTokens", () => {
  it("lists native first", () => {
    const tokens = listTokens();
    expect(tokens[0].symbol).toBe("XDC");
    expect(tokens.map((t) => t.symbol)).toContain("USDC");
  });
});
