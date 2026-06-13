# XDC Multi-Token AI Agent

An autonomous AI agent for XDC Network, driven by natural-language instructions from your terminal. It can:

- **Send native XDC** and **any ERC-20 token** (USDC, USDT, …) from a config-driven token list
- **Swap tokens** on a DEX (XSwap, a UniswapV2-style AMM), e.g. *"Swap 100 USDC to XDC"*
- **Check balances** across all configured tokens

No browser extension required.

---

## How it works

```
You: "Swap 100 USDC to XDC"   (or "Send 20 USDC to xdc1a2b3c...")
        │
        ▼
  Claude AI parses intent
  (action + token(s) + amount + address)
        │
        ▼
  Quote / safety checks (max amount, slippage)
        │
        ▼
  Confirmation prompt (optional)
        │
        ▼
  ethers.js signs & broadcasts tx
  (legacy type 0, 12.5 gwei)
        │
        ▼
  XDCScan link returned
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `PRIVATE_KEY` | Hex private key of your agent wallet |
| `MNEMONIC` | 12/24-word seed phrase (alternative to private key) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (console.anthropic.com) |
| `XDC_RPC_URL` | RPC endpoint (default: XDC Mainnet) |
| `USDC_CONTRACT_ADDRESS` | USDC contract on XDC Network |
| `TOKENS` | Extra ERC-20s, `SYMBOL:0xADDRESS` comma-separated (e.g. `USDT:0x...`) |
| `XSWAP_ROUTER_ADDRESS` | DEX router for swaps (required for "Swap …") |
| `WXDC_ADDRESS` | Wrapped XDC, used for swap routing |
| `SWAP_SLIPPAGE_PERCENT` | Max swap slippage in % (default: 1) |
| `REQUIRE_CONFIRMATION` | `true` = ask before each send/swap, `false` = auto |
| `MAX_SEND_AMOUNT` | Safety cap per transfer/swap (default: 1000, raw number) |

### 3. Run the agent

```bash
npm start
```

---

## Usage examples

```
You > Send 10 USDC to xdc1a2b3c4d5e6f...
You > Send 5 XDC to 0xABCDEF...
You > Transfer 20 USDT to xdc1a2b3c...
You > Swap 100 USDC to XDC
You > What are my balances?
You > exit
```

> **Swaps** require `XSWAP_ROUTER_ADDRESS` and `WXDC_ADDRESS` in `.env`, and a liquidity
> pool for the pair. Tokens other than the built-in `XDC`/`USDC` must be added via `TOKENS`.

---

## Testnet (Apothem)

To test without real funds, switch to Apothem in `.env`:

```env
XDC_RPC_URL=https://erpc.apothem.network
XDC_CHAIN_ID=51
USDC_CONTRACT_ADDRESS=<testnet USDC address>
```

Get testnet XDC from the faucet: https://faucet.apothem.network

---

## Project structure

```
xdc-multi-token-agent/
├── src/
│   ├── agent.js      ← Main CLI loop (entry point) + action handlers
│   ├── parser.js     ← Claude AI intent parser
│   ├── tokens.js     ← Config-driven token registry
│   ├── erc20.js      ← Native + ERC-20 reads/writes (send, approve, balance)
│   ├── swap.js       ← DEX swap (quote + approve + swap)
│   └── wallet.js     ← Wallet loader (private key / mnemonic)
├── .env.example      ← Config template
├── .gitignore
├── package.json
└── README.md
```

---

## Security

- **Never commit `.env`** — it contains your private key
- Use a **dedicated agent wallet** with only what it needs
- `MAX_SEND_AMOUNT` acts as a hard safety cap per transfer/swap
- Set `REQUIRE_CONFIRMATION=true` (default) for manual approval of every send/swap
- Swaps show the **expected output and minimum received** (after slippage) before you confirm
- **Verify DEX addresses** (`XSWAP_ROUTER_ADDRESS`, `WXDC_ADDRESS`) against official sources before use
- Test on **Apothem testnet** first — swaps interact with external DeFi contracts

---

## XDC Network notes

- Chain ID: `50` (Mainnet), `51` (Apothem Testnet)
- Transactions use **legacy type 0** (not EIP-1559)
- Minimum gas price: **12.5 gwei**
- Block explorer: https://xdcscan.com

#### Disclaimer:- This application uses AI to interpret natural language instructions. While safety checks are implemented, AI-generated outputs may be incorrect or incomplete. Always review transaction details carefully before confirming any transaction. The user remains fully responsible for all transactions executed through the application.
