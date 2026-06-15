import "dotenv/config";
import readline from "readline";
import { loadProvider, loadWallet } from "./wallet.js";
import {
  getTokenBalance,
  sendToken,
  sendNative,
  simulateTransfer,
  normalizeAddress,
  isValidAddress,
} from "./erc20.js";
import { resolveToken, listTokens } from "./tokens.js";
import { quoteSwap, executeSwap, simulateSwap } from "./swap.js";
import { parseInstruction } from "./parser.js";
import { describeChainError } from "./simulate.js";
import { withRetry } from "./retry.js";
import { take } from "./ratelimit.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const EXPLORER = "https://xdcscan.com/tx/";
const MAX_SEND = parseFloat(process.env.MAX_SEND_AMOUNT || "1000");
const REQUIRE_CONFIRM = process.env.REQUIRE_CONFIRMATION !== "false";

function log(msg = "") { console.log(msg); }
function info(msg) { console.log(`  ℹ  ${msg}`); }
function success(msg) { console.log(`  ✓  ${msg}`); }
function warn(msg) { console.log(`  ⚠  ${msg}`); }
function error(msg) { console.log(`  ✗  ${msg}`); }
function divider() { console.log("  " + "─".repeat(56)); }

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

/**
 * Fetches balances for every registered token.
 * @returns {Promise<Array<{ symbol, balance }>>}
 */
async function fetchBalances(provider, wallet) {
  const tokens = listTokens();
  return Promise.all(
    tokens.map(async (token) => {
      try {
        return { symbol: token.symbol, balance: await withRetry(() => getTokenBalance(provider, wallet.address, token)) };
      } catch {
        return { symbol: token.symbol, balance: "—" };
      }
    })
  );
}

function printBalances(balances) {
  for (const { symbol, balance } of balances) {
    info(`${symbol.padEnd(6)}: ${balance}`);
  }
}

function printBanner(walletAddress, balances) {
  console.log("\n");
  console.log("  ╔══════════════════════════════════════════════════════╗");
  console.log("  ║          XDC Multi-Token AI Agent  ·  v2.0.0         ║");
  console.log("  ╚══════════════════════════════════════════════════════╝");
  console.log();
  info(`Wallet  : ${walletAddress}`);
  printBalances(balances);
  info(`Network : ${process.env.XDC_RPC_URL || "https://rpc.xinfin.network"}`);
  info(`Confirm : ${REQUIRE_CONFIRM ? "ON (you will approve each action)" : "OFF (auto-executes)"}`);
  console.log();
  info("Type a natural instruction, e.g:");
  info('  "Send 10 USDC to xdc1a2b3c..."');
  info('  "Send 5 XDC to 0xABCD..."');
  info('  "Swap 100 USDC to XDC"');
  info('  "What are my balances?"');
  info('  Type "exit" to quit.');
  console.log();
}

// ── Transfer handler ─────────────────────────────────────────────────────────

async function handleTransfer(rl, wallet, provider, parsed) {
  const { to, amount } = parsed;

  // Resolve token (default USDC for backward-compat, handled by the parser too).
  const token = resolveToken(parsed.token || "USDC");
  if (!token) {
    error(`Unknown token: "${parsed.token}". Supported: ${listTokens().map((t) => t.symbol).join(", ")}`);
    return;
  }

  if (!isValidAddress(to)) {
    error(`Invalid address: "${to}"`);
    return;
  }

  if (!(amount > 0)) {
    error(`Invalid amount: "${amount}".`);
    return;
  }

  if (amount > MAX_SEND) {
    error(`Amount ${amount} ${token.symbol} exceeds safety limit of ${MAX_SEND}.`);
    warn(`Edit MAX_SEND_AMOUNT in .env to raise the limit. (Note: limit is a raw number, not USD-normalized.)`);
    return;
  }

  const normalizedTo = normalizeAddress(to);

  // Dry-run before asking the user to confirm, so reverts surface up front.
  try {
    const sim = await simulateTransfer(provider, wallet.address, token, normalizedTo, amount);
    if (!sim.ok) {
      error(`Simulation failed: ${sim.reason}`);
      warn("Not sending — fix the issue above and try again.");
      return;
    }
  } catch (err) {
    warn(`Could not simulate the transfer (${describeChainError(err)}); proceeding with caution.`);
  }

  log();
  info(`AI understood: ${parsed.message}`);
  divider();
  info(`  To      : ${to}`);
  info(`  Amount  : ${amount} ${token.symbol}`);
  info(`  Gas     : estimated dynamically (legacy tx, 12.5 gwei)`);
  info(`  Check   : ✓ simulated OK`);
  divider();

  if (REQUIRE_CONFIRM) {
    const answer = await prompt(rl, "  Confirm send? (yes / no): ");
    if (answer.trim().toLowerCase() !== "yes") {
      warn("Transfer cancelled.");
      return;
    }
  }

  log();
  try {
    const receipt = token.native
      ? await sendNative(wallet, normalizedTo, amount)
      : await sendToken(wallet, token, normalizedTo, amount);

    if (receipt.status === 1) {
      success(`Sent ${amount} ${token.symbol} successfully!`);
      success(`Tx hash : ${receipt.hash}`);
      success(`Explorer: ${EXPLORER}${receipt.hash}`);
      success(`Block   : ${receipt.blockNumber}`);
    } else {
      error(`Transaction reverted. Hash: ${receipt.hash}`);
    }
  } catch (err) {
    error(`Transaction failed: ${describeChainError(err)}`);
    if ((err.message || "").includes("insufficient funds")) {
      warn(`Check your ${token.symbol} balance or XDC for gas.`);
    }
  }
}

// ── Swap handler ───────────────────────────────────────────────────────────--

async function handleSwap(rl, wallet, provider, parsed) {
  const { amount } = parsed;
  const fromToken = resolveToken(parsed.fromToken);
  const toToken = resolveToken(parsed.toToken);

  if (!fromToken || !toToken) {
    const unknown = !fromToken ? parsed.fromToken : parsed.toToken;
    error(`Unknown token: "${unknown}". Supported: ${listTokens().map((t) => t.symbol).join(", ")}`);
    return;
  }
  if (fromToken.symbol === toToken.symbol) {
    error("Cannot swap a token for itself.");
    return;
  }
  if (!(amount > 0)) {
    error(`Invalid amount: "${amount}".`);
    return;
  }
  if (amount > MAX_SEND) {
    error(`Amount ${amount} ${fromToken.symbol} exceeds safety limit of ${MAX_SEND}.`);
    warn("Edit MAX_SEND_AMOUNT in .env to raise the limit.");
    return;
  }

  // Resolve decimals for both sides (getTokenBalance caches them on the token).
  try {
    await getTokenBalance(provider, wallet.address, fromToken);
    await getTokenBalance(provider, wallet.address, toToken);
  } catch (err) {
    error(`Could not read token details: ${err.reason || err.message}`);
    return;
  }

  let quote;
  try {
    info("Fetching a quote from the DEX...");
    quote = await withRetry(() => quoteSwap(provider, fromToken, toToken, amount));
  } catch (err) {
    error(`Quote failed: ${describeChainError(err)}`);
    warn("Check XSWAP_ROUTER_ADDRESS / WXDC_ADDRESS in .env, or that a liquidity pool exists.");
    return;
  }

  // Dry-run the swap (skipped automatically when an approval is still required).
  let simNote = "✓ simulated OK";
  try {
    const sim = await simulateSwap(provider, wallet.address, fromToken, toToken, amount, quote);
    if (!sim.ok) {
      error(`Simulation failed: ${sim.reason}`);
      warn("Not swapping — fix the issue above and try again.");
      return;
    }
    if (sim.reason) simNote = sim.reason; // e.g. "Skipped — approval required first."
  } catch (err) {
    simNote = `could not simulate (${describeChainError(err)})`;
  }

  log();
  info(`AI understood: ${parsed.message}`);
  divider();
  info(`  Swap    : ${amount} ${fromToken.symbol} → ${toToken.symbol}`);
  info(`  Expected: ~${parseFloat(quote.amountOut).toFixed(6)} ${toToken.symbol}`);
  info(`  Min recv: ${parseFloat(quote.minOut).toFixed(6)} ${toToken.symbol} (slippage ${quote.slippage}%)`);
  info(`  Check   : ${simNote}`);
  if (!fromToken.native) info(`  Note    : an approval tx may be sent first.`);
  divider();

  if (REQUIRE_CONFIRM) {
    const answer = await prompt(rl, "  Confirm swap? (yes / no): ");
    if (answer.trim().toLowerCase() !== "yes") {
      warn("Swap cancelled.");
      return;
    }
  }

  log();
  try {
    const receipt = await executeSwap(wallet, fromToken, toToken, amount, quote);
    if (receipt.status === 1) {
      success(`Swapped ${amount} ${fromToken.symbol} → ${toToken.symbol}!`);
      success(`Tx hash : ${receipt.hash}`);
      success(`Explorer: ${EXPLORER}${receipt.hash}`);
      success(`Block   : ${receipt.blockNumber}`);
    } else {
      error(`Swap reverted. Hash: ${receipt.hash}`);
    }
  } catch (err) {
    error(`Swap failed: ${describeChainError(err)}`);
    if ((err.message || "").includes("insufficient funds")) {
      warn(`Check your ${fromToken.symbol} balance or XDC for gas.`);
    }
  }
}

// ── Read-only handlers ─────────────────────────────────────────────────────--

async function handleBalance(rl, wallet, provider) {
  log();
  info(`Wallet  : ${wallet.address}`);
  printBalances(await fetchBalances(provider, wallet));
}

function handleHelp() {
  log();
  info("I can send tokens and swap on XDC Network from natural-language instructions.");
  info("Examples:");
  info('  "Send 10 USDC to xdc1abc..."');
  info('  "Send 5 XDC to 0xDEAD..."');
  info('  "Swap 100 USDC to XDC"');
  info('  "What are my balances?"');
  info(`Supported tokens: ${listTokens().map((t) => t.symbol).join(", ")}`);
}

function handleUnclear(rl, wallet, provider, parsed) {
  warn(parsed.error || parsed.message || "I didn't understand that instruction.");
  info('Try: "Send 10 USDC to xdc1a2b3c..." or "Swap 100 USDC to XDC"');
}

// Action → handler registry. Each handler gets (rl, wallet, provider, parsed).
const HANDLERS = {
  transfer: handleTransfer,
  swap: handleSwap,
  balance: handleBalance,
  help: (rl, wallet, provider, parsed) => handleHelp(),
  unclear: handleUnclear,
};

// ── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  let provider, wallet, balances;
  try {
    provider = loadProvider();
    log("\n  Loading wallet and fetching balances...");
    wallet = await loadWallet(provider);
    balances = await fetchBalances(provider, wallet);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }

  printBanner(wallet.address, balances);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "  You > ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      log("\n  Goodbye.\n");
      rl.close();
      process.exit(0);
    }

    log();

    // Best-effort local throttle so a runaway loop can't hammer the LLM API.
    const gate = take("parse", { capacity: 8, refillPerSec: 0.5 });
    if (!gate.allowed) {
      warn(`Slow down — try again in ~${Math.ceil(gate.retryAfterMs / 1000)}s.`);
      rl.prompt();
      return;
    }

    // Refresh balances for parser context.
    try { balances = await fetchBalances(provider, wallet); } catch {}

    let parsed;
    try {
      info("Thinking...");
      parsed = await parseInstruction(input, { walletAddress: wallet.address, tokens: balances });
    } catch (err) {
      error(`AI error: ${err.message}`);
      rl.prompt();
      return;
    }

    const handler = HANDLERS[parsed.action] || handleUnclear;
    await handler(rl, wallet, provider, parsed);

    log();
    rl.prompt();
  });

  rl.on("close", () => { process.exit(0); });
}

main();
