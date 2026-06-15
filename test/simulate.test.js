import { describe, it, expect } from "vitest";
import { simulateTx, describeChainError } from "../src/simulate.js";

describe("describeChainError", () => {
  it("maps common chain errors", () => {
    expect(describeChainError(new Error("insufficient funds"))).toMatch(/Insufficient funds/);
    expect(describeChainError(new Error("ERC20: transfer amount exceeds balance"))).toMatch(/balance is too low/);
    expect(describeChainError(new Error("INSUFFICIENT_OUTPUT_AMOUNT"))).toMatch(/slippage/);
    expect(describeChainError(new Error("execution reverted: Paused"))).toMatch(/Paused/);
  });
  it("falls back to the raw message", () => {
    expect(describeChainError(new Error("weird"))).toBe("weird");
  });
});

describe("simulateTx", () => {
  it("returns ok on success", async () => {
    const provider = { call: async () => "0x" };
    expect(await simulateTx(provider, { to: "0x1" })).toEqual({ ok: true });
  });
  it("returns ok:false with a decoded reason on revert", async () => {
    const provider = { call: async () => { throw new Error("execution reverted: ERC20: transfer amount exceeds balance"); } };
    const res = await simulateTx(provider, { to: "0x1", from: "0x2" });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/balance is too low/);
  });
});
