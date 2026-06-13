import { ethers } from "ethers";

/**
 * Converts an xdc-prefixed address to 0x format (local copy to keep this
 * module free of cross-imports; the canonical helper lives in erc20.js).
 */
function toHex(addr) {
  return addr?.toLowerCase().startsWith("xdc") ? "0x" + addr.slice(3) : addr;
}

/**
 * Config-driven token registry.
 *
 * A lookup table mapping a token symbol (e.g. "USDC") to its on-chain details.
 * The agent only ever sends/swaps tokens that exist in this table, and the list
 * is controlled from .env — not hardcoded — so adding a token or switching
 * networks is a settings change, not a code change.
 *
 * Token shape: { symbol, name, address, decimals, native }
 *  - native XDC has no address and is flagged `native: true`
 *  - ERC-20 tokens carry a 0x address; decimals/symbol are read on-chain lazily
 */

const NATIVE = { symbol: "XDC", name: "XDC", address: null, decimals: 18, native: true };

/**
 * Builds the registry from environment config.
 * Always includes native XDC and (if configured) USDC from USDC_CONTRACT_ADDRESS.
 * Extra tokens come from the TOKENS env var, format: "USDT:0xabc...,WXDC:0xdef..."
 *
 * @returns {Map<string, object>} symbol (uppercase) -> token
 */
function buildRegistry() {
  const registry = new Map();
  registry.set(NATIVE.symbol, NATIVE);

  // Built-in USDC entry (backward-compat with the original single-token agent).
  const usdcAddr = process.env.USDC_CONTRACT_ADDRESS;
  if (usdcAddr) {
    registry.set("USDC", { symbol: "USDC", name: "USD Coin", address: ethers.getAddress(toHex(usdcAddr)), decimals: null, native: false });
  }

  // Extra tokens from TOKENS env var.
  const extra = process.env.TOKENS;
  if (extra) {
    for (const pair of extra.split(",")) {
      const [rawSymbol, rawAddr] = pair.split(":").map((s) => s?.trim());
      if (!rawSymbol || !rawAddr) continue;
      const symbol = rawSymbol.toUpperCase();
      const normalized = toHex(rawAddr);
      if (!ethers.isAddress(normalized)) {
        console.warn(`  ⚠  Skipping token "${rawSymbol}" in TOKENS: invalid address "${rawAddr}"`);
        continue;
      }
      registry.set(symbol, { symbol, name: symbol, address: ethers.getAddress(normalized), decimals: null, native: false });
    }
  }

  return registry;
}

// Built once per process from current env.
const REGISTRY = buildRegistry();

/**
 * Resolves a user-supplied symbol/name to a token, case-insensitively.
 * @returns {object|null} the token, or null if unknown
 */
export function resolveToken(nameOrSymbol) {
  if (!nameOrSymbol) return null;
  return REGISTRY.get(String(nameOrSymbol).trim().toUpperCase()) || null;
}

/**
 * Returns all registered tokens (native first, then ERC-20s).
 */
export function listTokens() {
  return Array.from(REGISTRY.values());
}
