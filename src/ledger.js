import { ethers } from "ethers";

/**
 * Ledger hardware-wallet signer for XDC (legacy type-0 transactions).
 *
 * The private key never leaves the device — every send prompts an on-device
 * confirmation. The heavy USB transport deps are OPTIONAL and imported lazily in
 * `createLedgerSigner` so users on the env-key path never need them installed.
 *
 * ⚠ Verification note: this path requires a physical Ledger to exercise
 * end-to-end and is NOT covered by the automated test suite beyond the
 * unsigned-serialization logic (which is device-independent). The v/yParity
 * normalization below handles the common Ledger return formats (raw yParity,
 * 27/28, or full EIP-155 v); confirm against your device + firmware before
 * mainnet use.
 */

const DEFAULT_PATH = "44'/60'/0'/0/0";

export class LedgerSigner extends ethers.AbstractSigner {
  /**
   * @param {ethers.Provider|null} provider
   * @param {{ path: string, app: object, address: string }} opts
   *        `app` is an @ledgerhq/hw-app-eth instance (or a compatible mock).
   */
  constructor(provider, { path, app, address }) {
    super(provider);
    this._path = path;
    this._app = app;
    this._address = ethers.getAddress(address);
  }

  async getAddress() {
    return this._address;
  }

  connect(provider) {
    return new LedgerSigner(provider, { path: this._path, app: this._app, address: this._address });
  }

  /**
   * Serializes the unsigned tx, asks the device to sign it, then reattaches the
   * signature. Supports legacy type-0 txs (what XDC requires).
   */
  async signTransaction(tx) {
    const txObj = ethers.Transaction.from({ ...tx });
    const unsignedHex = txObj.unsignedSerialized.slice(2); // strip 0x for hw-app-eth

    const sig = await this._app.signTransaction(this._path, unsignedHex, null);

    txObj.signature = ethers.Signature.from({
      r: "0x" + sig.r,
      s: "0x" + sig.s,
      yParity: normalizeYParity(sig.v, Number(txObj.chainId ?? 0)),
    });
    return txObj.serialized;
  }

  async signMessage(message) {
    const bytes = typeof message === "string" ? ethers.toUtf8Bytes(message) : message;
    const sig = await this._app.signPersonalMessage(this._path, Buffer.from(bytes).toString("hex"));
    return ethers.Signature.from({
      r: "0x" + sig.r,
      s: "0x" + sig.s,
      yParity: normalizeYParity(sig.v, 0),
    }).serialized;
  }

  async signTypedData() {
    throw new Error("signTypedData is not supported by the Ledger adapter (not needed for XDC payments).");
  }
}

/**
 * Normalizes a Ledger-returned `v` into a yParity bit (0/1). Ledger firmware
 * variants return raw yParity, 27/28, or an EIP-155 v (35 + 2*chainId + yParity).
 * @param {string|number} v
 * @param {number} chainId
 * @returns {number} 0 or 1
 */
export function normalizeYParity(v, chainId) {
  const n = typeof v === "string" ? parseInt(v, 16) : Number(v);
  if (n === 0 || n === 1) return n;
  if (n === 27 || n === 28) return n - 27;
  // EIP-155: v = 35 + chainId*2 + yParity
  return (n - 35 - 2 * chainId) & 1;
}

/**
 * Connects to a Ledger over USB and returns a provider-bound signer.
 * Lazily imports the optional @ledgerhq deps.
 *
 * @param {ethers.Provider} provider
 * @returns {Promise<LedgerSigner>}
 */
export async function createLedgerSigner(provider) {
  let TransportNodeHid, Eth;
  try {
    ({ default: TransportNodeHid } = await import("@ledgerhq/hw-transport-node-hid"));
    ({ default: Eth } = await import("@ledgerhq/hw-app-eth"));
  } catch {
    throw new Error(
      "Ledger support needs optional dependencies. Install them with:\n" +
        "  npm install @ledgerhq/hw-transport-node-hid @ledgerhq/hw-app-eth",
    );
  }

  const path = process.env.LEDGER_DERIVATION_PATH || DEFAULT_PATH;
  const transport = await TransportNodeHid.create();
  const app = new Eth(transport);
  const { address } = await app.getAddress(path);
  return new LedgerSigner(provider, { path, app, address });
}
