import { ethers } from "ethers";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// XDC Network requires legacy transactions (type 0), not EIP-1559.
const LEGACY_GAS = {
  type: 0,
  gasPrice: ethers.parseUnits("12.5", "gwei"),
};

/**
 * Lazily fills (and caches) a token's on-chain decimals using a contract we
 * already hold, so callers never need to know decimals up front.
 * @returns {Promise<number>} the token's decimals
 */
async function fillDecimals(token, contract) {
  if (token.decimals == null) {
    token.decimals = Number(await contract.decimals());
  }
  return token.decimals;
}

/**
 * Fetches the balance of a single token (native XDC or ERC-20) for an address.
 * Returns a human-readable string formatted to a sensible number of decimals.
 *
 * @param {ethers.Provider} provider
 * @param {string}          owner    - address to read (0x format)
 * @param {object}          token    - registry token { symbol, address, decimals, native }
 * @returns {Promise<string>} formatted balance
 */
export async function getTokenBalance(provider, owner, token) {
  if (token.native) {
    const raw = await provider.getBalance(owner);
    return parseFloat(ethers.formatEther(raw)).toFixed(4);
  }

  const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
  const decimals = await fillDecimals(token, contract);
  const raw = await contract.balanceOf(owner);
  // Stablecoins (6 decimals) read best at 2dp; others at 4dp.
  const dp = decimals <= 6 ? 2 : 4;
  return parseFloat(ethers.formatUnits(raw, decimals)).toFixed(dp);
}

/**
 * Sends native XDC to a recipient.
 *
 * @param {ethers.Wallet} wallet
 * @param {string}        to      - recipient (0x format)
 * @param {number|string} amount  - human-readable XDC amount
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export async function sendNative(wallet, to, amount) {
  const tx = await wallet.sendTransaction({
    to,
    value: ethers.parseEther(amount.toString()),
    gasLimit: 21_000n,
    ...LEGACY_GAS,
  });

  console.log(`\n  Transaction sent: ${tx.hash}`);
  console.log("  Waiting for confirmation...");
  return tx.wait();
}

/**
 * Sends an ERC-20 token to a recipient.
 *
 * @param {ethers.Wallet} wallet
 * @param {object}        token   - registry token (must be ERC-20, not native)
 * @param {string}        to      - recipient (0x format)
 * @param {number|string} amount  - human-readable token amount
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export async function sendToken(wallet, token, to, amount) {
  const contract = new ethers.Contract(token.address, ERC20_ABI, wallet);
  const decimals = await fillDecimals(token, contract);
  const amountWei = ethers.parseUnits(amount.toString(), decimals);

  const tx = await contract.transfer(to, amountWei, { gasLimit: 100_000n, ...LEGACY_GAS });

  console.log(`\n  Transaction sent: ${tx.hash}`);
  console.log("  Waiting for confirmation...");
  return tx.wait();
}

/**
 * Reads the ERC-20 allowance an owner has granted a spender.
 * @returns {Promise<bigint>} allowance in token base units (wei)
 */
export async function getAllowance(provider, token, owner, spender) {
  const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
  return contract.allowance(owner, spender);
}

/**
 * Approves a spender to move up to `amount` of an ERC-20 token on the wallet's behalf.
 *
 * @param {ethers.Wallet} wallet
 * @param {object}        token   - registry token (ERC-20)
 * @param {string}        spender - address allowed to spend (0x format)
 * @param {number|string} amount  - human-readable token amount
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export async function approve(wallet, token, spender, amount) {
  const contract = new ethers.Contract(token.address, ERC20_ABI, wallet);
  const decimals = await fillDecimals(token, contract);
  const amountWei = ethers.parseUnits(amount.toString(), decimals);

  const tx = await contract.approve(spender, amountWei, { gasLimit: 80_000n, ...LEGACY_GAS });

  console.log(`\n  Approval sent: ${tx.hash}`);
  console.log("  Waiting for confirmation...");
  return tx.wait();
}

/**
 * Converts an xdc-prefixed address to 0x format.
 * XDC Network uses the xdc prefix; ethers.js needs 0x.
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
