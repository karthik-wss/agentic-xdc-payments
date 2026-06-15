import { ethers } from "ethers";

/**
 * Loads a signer based on WALLET_TYPE:
 *  - "ledger"           → hardware wallet (keys never leave the device)
 *  - default (env keys) → ethers.Wallet from PRIVATE_KEY or MNEMONIC
 *
 * Async because the Ledger path connects to USB. The env-key path stays
 * effectively synchronous (no awaits) for backward compatibility.
 *
 * ⚠ Hot keys (PRIVATE_KEY/MNEMONIC) are for development/CI only. For anything
 * holding real value, prefer WALLET_TYPE=ledger or a secrets manager — see
 * SECURITY.md.
 *
 * @param {ethers.Provider} provider
 * @returns {Promise<ethers.Signer>}
 */
export async function loadWallet(provider) {
  const walletType = (process.env.WALLET_TYPE || "").toLowerCase();

  if (walletType === "ledger") {
    const { createLedgerSigner } = await import("./ledger.js");
    return createLedgerSigner(provider);
  }

  const pk = process.env.PRIVATE_KEY;
  const mnemonic = process.env.MNEMONIC;

  if (pk && pk !== "0x_your_private_key_here") {
    const key = pk.startsWith("0x") ? pk : "0x" + pk;
    return new ethers.Wallet(key, provider);
  }

  if (mnemonic && mnemonic !== "word1 word2 ...") {
    return ethers.Wallet.fromPhrase(mnemonic.trim()).connect(provider);
  }

  throw new Error(
    "No wallet credentials found.\n" +
    "Set PRIVATE_KEY or MNEMONIC in your .env file, or use WALLET_TYPE=ledger."
  );
}

/**
 * Returns an ethers JsonRpcProvider connected to XDC Network.
 */
export function loadProvider() {
  const rpc = process.env.XDC_RPC_URL || "https://rpc.xinfin.network";
  return new ethers.JsonRpcProvider(rpc);
}
