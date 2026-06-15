import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { LedgerSigner, normalizeYParity } from "../src/ledger.js";

describe("normalizeYParity", () => {
  it("passes through raw yParity", () => {
    expect(normalizeYParity(0, 51)).toBe(0);
    expect(normalizeYParity(1, 51)).toBe(1);
  });
  it("normalizes 27/28", () => {
    expect(normalizeYParity(27, 51)).toBe(0);
    expect(normalizeYParity(28, 51)).toBe(1);
  });
  it("normalizes an EIP-155 v", () => {
    const chainId = 51;
    expect(normalizeYParity(35 + 2 * chainId + 0, chainId)).toBe(0);
    expect(normalizeYParity(35 + 2 * chainId + 1, chainId)).toBe(1);
  });
  it("accepts a hex string", () => {
    expect(normalizeYParity("1b", 51)).toBe(0); // 0x1b = 27
  });
});

describe("LedgerSigner.signTransaction", () => {
  it("produces a signed tx that recovers to the device address", async () => {
    // Use a software wallet only to GENERATE a valid signature the mock 'device'
    // will hand back — the adapter logic (serialize → attach sig) is what's tested.
    const wallet = ethers.Wallet.createRandom();
    const chainId = 51;
    const tx = {
      to: "0x000000000000000000000000000000000000dEaD",
      value: 0n,
      gasLimit: 21_000n,
      gasPrice: ethers.parseUnits("12.5", "gwei"),
      type: 0,
      chainId,
      nonce: 0,
    };

    const reference = ethers.Transaction.from(await wallet.signTransaction(tx));
    const sig = reference.signature;
    const eip155v = 35 + 2 * chainId + sig.yParity;

    const app = {
      signTransaction: async () => ({
        r: sig.r.slice(2),
        s: sig.s.slice(2),
        v: eip155v.toString(16), // mimic a Ledger returning an EIP-155 v
      }),
    };

    const ledger = new LedgerSigner(null, { path: "m/44'/60'/0'/0/0", app, address: wallet.address });
    const out = await ledger.signTransaction(tx);

    const recovered = ethers.Transaction.from(out);
    expect(recovered.from).toBe(wallet.address);
    expect(recovered.type).toBe(0);
  });

  it("getAddress returns the checksummed device address", async () => {
    const ledger = new LedgerSigner(null, {
      path: "m",
      app: {},
      address: "0x000000000000000000000000000000000000dead",
    });
    expect(await ledger.getAddress()).toBe("0x000000000000000000000000000000000000dEaD");
  });
});
