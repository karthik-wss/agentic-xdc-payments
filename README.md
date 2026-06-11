# XDC USDC AI Agent

An autonomous AI agent that sends USDC on XDC Network based on natural language instructions. No browser extension required — runs entirely from your terminal.

---

## How it works

```
You: "Send 20 USDC to xdc1a2b3c..."
        │
        ▼
  Claude AI parses intent
  (extracts address + amount)
        │
        ▼
  Confirmation prompt (optional)
        │
        ▼
  ethers.js signs & broadcasts tx
  (legacy type 0, 12.5 gwei, XDC Mainnet)
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
| `REQUIRE_CONFIRMATION` | `true` = ask before each send, `false` = auto-send |
| `MAX_SEND_AMOUNT` | Safety cap per transaction (default: 1000 USDC) |

### 3. Run the agent

```bash
npm start
```

---

## Usage examples

```
You > Send 10 USDC to xdc1a2b3c4d5e6f...
You > Transfer 50.5 USDC to 0xABCDEF...
You > What is my USDC balance?
You > How much XDC do I have?
You > exit
```

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
xdc-usdc-agent/
├── src/
│   ├── agent.js      ← Main CLI loop (entry point)
│   ├── parser.js     ← Claude AI intent parser
│   ├── usdc.js       ← USDC contract interactions
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
- `MAX_SEND_AMOUNT` acts as a hard safety cap per transaction
- Set `REQUIRE_CONFIRMATION=true` (default) for manual approval of every send

---

## XDC Network notes

- Chain ID: `50` (Mainnet), `51` (Apothem Testnet)
- Transactions use **legacy type 0** (not EIP-1559)
- Minimum gas price: **12.5 gwei**
- Block explorer: https://xdcscan.com
