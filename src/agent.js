import "dotenv/config";
import readline from "readline";
import { loadProvider, loadWallet } from "./wallet.js";
import { getBalances, sendUSDC, normalizeAddress, isValidAddress } from "./usdc.js";
import { parseInstruction } from "./parser.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const EXPLORER = "https://xdcscan.com/tx/";
const MAX_SEND = parseFloat(process.env.MAX_SEND_AMOUNT || "1000");
const REQUIRE_CONFIRM = process.env.REQUIRE_CONFIRMATION !== "false";

function log(msg) { console.log(msg); }
function info(msg) { console.log(`  ℹ  ${msg}`); }
function success(msg) { console.log(`  ✓  ${msg}`); }
function warn(msg) { console.log(`  ⚠  ${msg}`); }
function error(msg) { console.log(`  ✗  ${msg}`); }
function divider() { console.log("  " + "─".repeat(56)); }

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function printBanner(walletAddress, balances) {
  console.log("\n");
  console.log("  ╔══════════════════════════════════════════════════════╗");
  console.log("  ║          XDC USDC AI Agent  ·  v1.0.0               ║");
  console.log("  ╚══════════════════════════════════════════════════════╝");
  console.log();
  info(`Wallet  : ${walletAddress}`);
  info(`XDC     : ${balances.xdc} XDC`);
  info(`USDC    : ${balances.usdc} ${balances.symbol}`);
  info(`Network : ${process.env.XDC_RPC_URL || "https://rpc.xinfin.network"}`);
  info(`Confirm : ${REQUIRE_CONFIRM ? "ON (you will approve each send)" : "OFF (auto-sends)"}`);
  console.log();
  info('Type a natural instruction, e.g:');
  info('  "Send 10 USDC to xdc1a2b3c..."');
  info('  "What is my USDC balance?"');
  info('  "Transfer 5.5 USDC to 0xABCD..."');
  info('  Type "exit" to quit.');
  console.log();
}

// ── Transfer handler ─────────────────────────────────────────────────────────

async function handleTransfer(rl, wallet, provider, parsed) {
  const { to, amount, message } = parsed;

  // Validate address
  if (!isValidAddress(to)) {
    error(`Invalid address: "${to}"`);
    return;
  }

  // Enforce max send limit
  if (amount > MAX_SEND) {
    error(`Amount ${amount} USDC exceeds safety limit of ${MAX_SEND} USDC.`);
    warn(`Edit MAX_SEND_AMOUNT in .env to raise the limit.`);
    return;
  }

  const normalizedTo = normalizeAddress(to);

  log();
  info(`AI understood: ${message}`);
  divider();
  info(`  To      : ${to}`);
  info(`  Amount  : ${amount} USDC`);
  info(`  Gas     : ~0.01 XDC (legacy tx, 12.5 gwei)`);
  divider();

  // Confirmation prompt
  if (REQUIRE_CONFIRM) {
    const answer = await prompt(rl, "  Confirm send? (yes / no): ");
    if (answer.trim().toLowerCase() !== "yes") {
      warn("Transfer cancelled.");
      return;
    }
  }

  log();
  try {
    const receipt = await sendUSDC(wallet, normalizedTo, amount);

    if (receipt.status === 1) {
      success(`Sent ${amount} USDC successfully!`);
      success(`Tx hash : ${receipt.hash}`);
      success(`Explorer: ${EXPLORER}${receipt.hash}`);
      success(`Block   : ${receipt.blockNumber}`);
    } else {
      error(`Transaction reverted. Hash: ${receipt.hash}`);
    }
  } catch (err) {
    error(`Transaction failed: ${err.reason || err.message}`);
    if (err.message.includes("insufficient funds")) {
      warn("Check your USDC balance or XDC for gas.");
    }
  }
}

// ── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  // Load wallet
  let provider, wallet, balances;
  try {
    provider = loadProvider();
    wallet = loadWallet(provider);
    log("\n  Loading wallet and fetching balances...");
    balances = await getBalances(provider, wallet);
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

    // Refresh balances for context
    try { balances = await getBalances(provider, wallet); } catch {}

    // Parse instruction via Claude AI
    let parsed;
    try {
      info("Thinking...");
      parsed = await parseInstruction(input, {
        walletAddress: wallet.address,
        xdcBalance: balances.xdc,
        usdcBalance: balances.usdc,
      });
    } catch (err) {
      error(`AI error: ${err.message}`);
      rl.prompt();
      return;
    }

    // Handle intent
    switch (parsed.action) {
      case "transfer":
        await handleTransfer(rl, wallet, provider, parsed);
        break;

      case "balance":
        log();
        info(`Wallet  : ${wallet.address}`);
        info(`XDC     : ${balances.xdc} XDC`);
        info(`USDC    : ${balances.usdc} ${balances.symbol}`);
        break;

      case "help":
        log();
        info("I can send USDC on XDC Network based on your instructions.");
        info('Examples:');
        info('  "Send 10 USDC to xdc1abc..."');
        info('  "Transfer 50.5 USDC to 0xDEAD..."');
        info('  "What is my balance?"');
        break;

      case "unclear":
      default:
        warn(parsed.error || parsed.message || "I didn't understand that instruction.");
        info('Try: "Send 10 USDC to xdc1a2b3c..."');
        break;
    }

    log();
    rl.prompt();
  });

  rl.on("close", () => { process.exit(0); });
}

main();
