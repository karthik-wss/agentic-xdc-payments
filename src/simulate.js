/**
 * Transaction simulation + chain-error normalization for the CLI.
 *
 * `simulateTx` dry-runs an unsigned tx with `eth_call` so reverts (insufficient
 * balance/allowance, no liquidity, slippage) surface before signing. Authoritative
 * for contract calls (ERC-20 transfer/approve, swaps); best-effort for plain
 * native sends (eth_call does not reliably check the sender's native balance).
 */

/**
 * @param {import("ethers").Provider} provider
 * @param {{ to: string, data?: string, value?: bigint|string|number, from?: string }} tx
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function simulateTx(provider, { to, data, value, from }) {
  try {
    await provider.call({ to, data, value: value ?? 0n, from });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: describeChainError(err) };
  }
}

/** Maps an ethers/RPC error to a short, user-facing message. */
export function describeChainError(err) {
  const raw =
    err?.reason ||
    err?.shortMessage ||
    err?.info?.error?.message ||
    err?.error?.message ||
    err?.message ||
    String(err);
  const lc = raw.toLowerCase();

  if (lc.includes("insufficient funds")) return "Insufficient funds for amount plus gas.";
  if (lc.includes("transfer amount exceeds balance")) return "Token balance is too low for this transfer.";
  if (lc.includes("insufficient allowance") || lc.includes("allowance")) {
    return "Token allowance is too low — an approval is required first.";
  }
  if (lc.includes("insufficient_output_amount")) return "Swap output would fall below the slippage limit.";
  if (lc.includes("insufficient_liquidity")) return "Not enough liquidity for this swap.";
  if (lc.includes("expired") || lc.includes("deadline")) return "The swap quote expired — request a fresh one.";
  if (lc.includes("execution reverted") || lc.includes("call_exception")) {
    const m = raw.match(/reverted:?\s*(.+)/i);
    return m && m[1] ? `Transaction would revert: ${m[1].trim()}` : "Transaction would revert on-chain.";
  }
  if (lc.includes("nonce")) return "Nonce error — a pending transaction may still be in flight.";
  if (lc.includes("timeout") || lc.includes("network") || lc.includes("econn")) {
    return "Network/RPC error — please try again.";
  }
  return raw;
}
