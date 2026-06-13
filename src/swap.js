import { ethers } from "ethers";
import { approve, getAllowance } from "./erc20.js";

/**
 * DEX swaps via a UniswapV2-style router (XSwap on XDC).
 *
 * Config (env):
 *  - XSWAP_ROUTER_ADDRESS : the V2 router contract
 *  - WXDC_ADDRESS         : wrapped XDC, used as the routing hop and for native sides
 *  - SWAP_SLIPPAGE_PERCENT: max slippage tolerated (default 1)
 *
 * Native XDC is swapped through the router's ETH-equivalent methods (the router
 * wraps/unwraps WXDC internally); ERC-20<->ERC-20 routes hop through WXDC.
 */

const ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
];

const LEGACY_GAS = {
  type: 0,
  gasPrice: ethers.parseUnits("12.5", "gwei"),
};
const SWAP_GAS_LIMIT = 300_000n;
const DEADLINE_SECONDS = 1200; // 20 minutes

function routerAddress() {
  const addr = process.env.XSWAP_ROUTER_ADDRESS;
  if (!addr) throw new Error("XSWAP_ROUTER_ADDRESS is not set in .env — swaps are unavailable.");
  return ethers.getAddress(addr.toLowerCase().startsWith("xdc") ? "0x" + addr.slice(3) : addr);
}

function wxdcAddress() {
  const addr = process.env.WXDC_ADDRESS;
  if (!addr) throw new Error("WXDC_ADDRESS is not set in .env — swaps are unavailable.");
  return ethers.getAddress(addr.toLowerCase().startsWith("xdc") ? "0x" + addr.slice(3) : addr);
}

function slippagePercent() {
  return parseFloat(process.env.SWAP_SLIPPAGE_PERCENT || "1");
}

/**
 * The token's on-chain address for routing. Native XDC routes via WXDC.
 */
function routableAddress(token, wxdc) {
  return token.native ? wxdc : token.address;
}

/**
 * Builds the swap path. Direct when one side is WXDC/native; otherwise hops
 * through WXDC (the standard liquidity hub on a V2 DEX).
 */
function buildPath(fromToken, toToken, wxdc) {
  const fromAddr = routableAddress(fromToken, wxdc);
  const toAddr = routableAddress(toToken, wxdc);
  if (fromAddr === wxdc || toAddr === wxdc) return [fromAddr, toAddr];
  return [fromAddr, wxdc, toAddr];
}

/**
 * Quotes a swap: how much `toToken` you'd receive for `amount` of `fromToken`,
 * and the minimum acceptable output after slippage.
 *
 * @returns {Promise<{ amountInWei: bigint, amountOut: string, minOut: string, minOutWei: bigint, path: string[], slippage: number }>}
 */
export async function quoteSwap(provider, fromToken, toToken, amount) {
  if (fromToken.decimals == null || toToken.decimals == null) {
    throw new Error("Token decimals must be resolved before quoting (call getTokenBalance first).");
  }

  const wxdc = wxdcAddress();
  const path = buildPath(fromToken, toToken, wxdc);
  const amountInWei = ethers.parseUnits(amount.toString(), fromToken.decimals);

  const router = new ethers.Contract(routerAddress(), ROUTER_ABI, provider);
  const amounts = await router.getAmountsOut(amountInWei, path);
  const outWei = amounts[amounts.length - 1];

  const slippage = slippagePercent();
  // minOut = out * (1 - slippage/100), computed in integer basis points to avoid float drift.
  const bps = BigInt(Math.round((100 - slippage) * 100));
  const minOutWei = (outWei * bps) / 10_000n;

  return {
    amountInWei,
    amountOut: ethers.formatUnits(outWei, toToken.decimals),
    minOut: ethers.formatUnits(minOutWei, toToken.decimals),
    minOutWei,
    path,
    slippage,
  };
}

/**
 * Executes a swap. If `fromToken` is an ERC-20 with insufficient allowance to the
 * router, it sends an approve tx first. Picks the correct router method based on
 * whether the native side is the input or output.
 *
 * @param {ethers.Wallet} wallet
 * @param {object} fromToken  - registry token (decimals resolved)
 * @param {object} toToken    - registry token (decimals resolved)
 * @param {number|string} amount - human-readable input amount
 * @param {object} quote      - result of quoteSwap()
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export async function executeSwap(wallet, fromToken, toToken, amount, quote) {
  const router = new ethers.Contract(routerAddress(), ROUTER_ABI, wallet);
  const to = wallet.address;
  const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS;
  const { amountInWei, minOutWei, path } = quote;

  // Ensure the router can pull the input token (ERC-20 input only).
  if (!fromToken.native) {
    const allowance = await getAllowance(wallet.provider, fromToken, to, routerAddress());
    if (allowance < amountInWei) {
      console.log(`  Approving ${amount} ${fromToken.symbol} for the router...`);
      await approve(wallet, fromToken, routerAddress(), amount);
    }
  }

  let tx;
  if (fromToken.native) {
    // XDC -> token
    tx = await router.swapExactETHForTokens(minOutWei, path, to, deadline, {
      value: amountInWei,
      gasLimit: SWAP_GAS_LIMIT,
      ...LEGACY_GAS,
    });
  } else if (toToken.native) {
    // token -> XDC
    tx = await router.swapExactTokensForETH(amountInWei, minOutWei, path, to, deadline, {
      gasLimit: SWAP_GAS_LIMIT,
      ...LEGACY_GAS,
    });
  } else {
    // token -> token
    tx = await router.swapExactTokensForTokens(amountInWei, minOutWei, path, to, deadline, {
      gasLimit: SWAP_GAS_LIMIT,
      ...LEGACY_GAS,
    });
  }

  console.log(`\n  Swap sent: ${tx.hash}`);
  console.log("  Waiting for confirmation...");
  return tx.wait();
}
