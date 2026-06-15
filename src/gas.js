import { ethers } from "ethers";

/**
 * Shared legacy-gas contract + dynamic gas estimation for the CLI.
 *
 * XDC requires legacy type-0 transactions ({ type: 0, gasPrice }). The per-op
 * GAS_LIMITS constants are retained as a *floor*: estimateGasWithFallback tries
 * a live estimate (+20% buffer) and only drops to the constant when estimation
 * fails (XDC's estimateGas can be unreliable).
 */

/** Gas price in wei; floor is env-configurable via XDC_GAS_PRICE_GWEI (default 12.5). */
export function resolveGasPrice() {
  return ethers.parseUnits(process.env.XDC_GAS_PRICE_GWEI || "12.5", "gwei");
}

export const LEGACY_GAS = {
  type: 0,
  gasPrice: resolveGasPrice(),
};

export const GAS_LIMITS = {
  native: 21_000n,
  tokenTransfer: 100_000n,
  approve: 80_000n,
  swap: 300_000n,
};

/**
 * Live gas estimate (+20%), floored at the per-op fallback. Returns the fallback
 * on any failure or when no provider is given.
 *
 * @param {ethers.Provider|null|undefined} provider
 * @param {object} tx            - { to, data?, value?, from? }
 * @param {bigint} fallbackLimit - one of GAS_LIMITS
 * @returns {Promise<bigint>}
 */
export async function estimateGasWithFallback(provider, tx, fallbackLimit) {
  if (!provider) return fallbackLimit;
  try {
    const est = await provider.estimateGas(tx);
    const buffered = (est * 12n) / 10n;
    return buffered > fallbackLimit ? buffered : fallbackLimit;
  } catch (err) {
    console.warn(`  ⚠  gas estimate failed; using fallback ${fallbackLimit}: ${err?.shortMessage || err?.message || err}`);
    return fallbackLimit;
  }
}
