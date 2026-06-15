import { describe, it, expect, beforeAll } from "vitest";

const ROUTER = "0x1111111111111111111111111111111111111111";
const WXDC = "0x2222222222222222222222222222222222222222";
const USDC_ADDR = "0x3333333333333333333333333333333333333333";

const XDC = { symbol: "XDC", name: "XDC", address: null, decimals: 18, native: true };
const USDC = { symbol: "USDC", name: "USD Coin", address: USDC_ADDR, decimals: 6, native: false };

let simulateSwap, quoteSwap;

beforeAll(async () => {
  process.env.XSWAP_ROUTER_ADDRESS = ROUTER;
  process.env.WXDC_ADDRESS = WXDC;
  ({ simulateSwap, quoteSwap } = await import("../src/swap.js"));
});

const quote = {
  amountInWei: 5_000_000_000_000_000_000n,
  minOutWei: 9_000_000n,
  path: [WXDC, USDC_ADDR],
};

describe("simulateSwap (native input)", () => {
  it("returns ok when the dry-run call succeeds", async () => {
    let seen;
    const provider = { call: async (tx) => { seen = tx; return "0x"; } };
    const res = await simulateSwap(provider, "0x000000000000000000000000000000000000dEaD", XDC, USDC, 5, quote);
    expect(res.ok).toBe(true);
    expect(seen.to.toLowerCase()).toBe(ROUTER);
    expect(seen.value).toBe(quote.amountInWei); // native input carried as value
  });

  it("returns ok:false with a reason on revert", async () => {
    const provider = { call: async () => { throw new Error("INSUFFICIENT_OUTPUT_AMOUNT"); } };
    const res = await simulateSwap(provider, "0x000000000000000000000000000000000000dEaD", XDC, USDC, 5, quote);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/slippage/);
  });
});

describe("quoteSwap", () => {
  it("requires decimals to be resolved", async () => {
    await expect(
      quoteSwap({}, { ...XDC, decimals: null }, { ...USDC, decimals: null }, 1),
    ).rejects.toThrow(/decimals/);
  });
});
