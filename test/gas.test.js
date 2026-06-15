import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { resolveGasPrice, estimateGasWithFallback, GAS_LIMITS, LEGACY_GAS } from "../src/gas.js";

describe("resolveGasPrice", () => {
  it("defaults to 12.5 gwei", () => {
    expect(resolveGasPrice()).toBe(ethers.parseUnits("12.5", "gwei"));
  });
});

describe("LEGACY_GAS", () => {
  it("is a legacy type-0 contract", () => {
    expect(LEGACY_GAS.type).toBe(0);
    expect(typeof LEGACY_GAS.gasPrice).toBe("bigint");
  });
});

describe("estimateGasWithFallback", () => {
  it("returns the fallback without a provider", async () => {
    expect(await estimateGasWithFallback(null, {}, GAS_LIMITS.native)).toBe(GAS_LIMITS.native);
  });
  it("buffers a live estimate by 20%", async () => {
    const provider = { estimateGas: async () => 1_000_000n };
    expect(await estimateGasWithFallback(provider, {}, GAS_LIMITS.native)).toBe(1_200_000n);
  });
  it("floors at the fallback", async () => {
    const provider = { estimateGas: async () => 1_000n };
    expect(await estimateGasWithFallback(provider, {}, GAS_LIMITS.tokenTransfer)).toBe(GAS_LIMITS.tokenTransfer);
  });
  it("falls back on estimate failure", async () => {
    const provider = { estimateGas: async () => { throw new Error("nope"); } };
    expect(await estimateGasWithFallback(provider, {}, GAS_LIMITS.swap)).toBe(GAS_LIMITS.swap);
  });
});
