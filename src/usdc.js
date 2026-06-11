import { ethers } from "ethers";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

/**
 * Fetches XDC and USDC balances for a wallet address.
 */
export async function getBalances(provider, wallet) {
  const contractAddr = ethers.getAddress(process.env.USDC_CONTRACT_ADDRESS);
  const usdc = new ethers.Contract(contractAddr, ERC20_ABI, provider);

  const [rawXdc, rawUsdc, decimals, symbol] = await Promise.all([
    provider.getBalance(wallet.address),
    usdc.balanceOf(wallet.address),
    usdc.decimals(),
    usdc.symbol(),
  ]);

  return {
    xdc: parseFloat(ethers.formatEther(rawXdc)).toFixed(4),
    usdc: parseFloat(ethers.formatUnits(rawUsdc, decimals)).toFixed(2),
    symbol,
    decimals,
  };
}

/**
 * Sends USDC to a recipient address.
 * Uses legacy tx type 0 with 12.5 gwei gas — required on XDC Network.
 *
 * @param {ethers.Wallet} wallet  - Signer wallet
 * @param {string}        to      - Recipient address (0x format)
 * @param {number|string} amount  - Human-readable USDC amount (e.g. "25.5")
 * @returns {ethers.TransactionReceipt}
 */
export async function sendUSDC(wallet, to, amount) {
  const contractAddr = ethers.getAddress(process.env.USDC_CONTRACT_ADDRESS);
  const usdc = new ethers.Contract(contractAddr, ERC20_ABI, wallet);

  const decimals = await usdc.decimals();
  const amountWei = ethers.parseUnits(amount.toString(), decimals);

  // XDC Network requires legacy transactions (type 0), not EIP-1559
  const tx = await usdc.transfer(to, amountWei, {
    type: 0,
    gasPrice: ethers.parseUnits("12.5", "gwei"),
    gasLimit: 100_000n,
  });

  console.log(`\n  Transaction sent: ${tx.hash}`);
  console.log("  Waiting for confirmation...");

  const receipt = await tx.wait();
  return receipt;
}

/**
 * Converts an xdc-prefixed address to 0x format.
 * XDC Network uses xdc prefix; ethers.js needs 0x.
 */
export function normalizeAddress(addr) {
  if (!addr) return null;
  if (addr.toLowerCase().startsWith("xdc")) {
    return "0x" + addr.slice(3);
  }
  return addr;
}

/**
 * Validates an address (accepts both xdc and 0x formats).
 */
export function isValidAddress(addr) {
  const normalized = normalizeAddress(addr);
  return ethers.isAddress(normalized);
}
