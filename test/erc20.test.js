import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { isValidAddress, normalizeAddress, simulateTransfer } from "../src/erc20.js";

const TO = "0x000000000000000000000000000000000000dEaD";
const XDC = { symbol: "XDC", name: "XDC", address: null, decimals: 18, native: true };
const USDC = { symbol: "USDC", name: "USD Coin", address: "0x0000000000000000000000000000000000000001", decimals: 6, native: false };

describe("address helpers", () => {
  it("normalizes and validates xdc/0x", () => {
    expect(normalizeAddress("xdc000000000000000000000000000000000000dEaD")).toBe(TO);
    expect(isValidAddress(TO)).toBe(true);
    expect(isValidAddress("nope")).toBe(false);
  });
});

describe("simulateTransfer", () => {
  it("dry-runs a native transfer (value send)", async () => {
    let seen;
    const provider = { call: async (tx) => { seen = tx; return "0x"; } };
    const res = await simulateTransfer(provider, TO, XDC, TO, 1);
    expect(res).toEqual({ ok: true });
    expect(seen.value).toBe(ethers.parseEther("1"));
    expect(seen.to).toBe(TO);
  });

  it("dry-runs an ERC-20 transfer to the token contract", async () => {
    let seen;
    const provider = { call: async (tx) => { seen = tx; return "0x"; } };
    const res = await simulateTransfer(provider, TO, USDC, TO, 5);
    expect(res).toEqual({ ok: true });
    expect(seen.to).toBe(USDC.address);
    expect(seen.data.startsWith("0xa9059cbb")).toBe(true);
  });

  it("surfaces a revert reason", async () => {
    const provider = { call: async () => { throw new Error("execution reverted: ERC20: transfer amount exceeds balance"); } };
    const res = await simulateTransfer(provider, TO, USDC, TO, 5);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/balance is too low/);
  });
});
