import { ethers } from "ethers";

/**
 * Loads an ethers Wallet from environment config.
 * Supports private key or mnemonic phrase.
 */
export function loadWallet(provider) {
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
    "Set PRIVATE_KEY or MNEMONIC in your .env file."
  );
}

/**
 * Returns an ethers JsonRpcProvider connected to XDC Network.
 */
export function loadProvider() {
  const rpc = process.env.XDC_RPC_URL || "https://rpc.xinfin.network";
  return new ethers.JsonRpcProvider(rpc);
}
