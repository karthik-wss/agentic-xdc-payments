import Anthropic from "@anthropic-ai/sdk";

const GROK_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
const DEFAULT_GROK_MODEL = "grok-4.3";

/**
 * Resolves which LLM provider to use: an explicit LLM_PROVIDER override wins,
 * otherwise auto-detect Grok when XAI_API_KEY is present, else Anthropic.
 * @returns {"anthropic" | "grok"}
 */
function resolveProvider() {
  const explicit = (process.env.LLM_PROVIDER || "").toLowerCase();
  if (explicit === "grok" || explicit === "anthropic") return explicit;
  if (process.env.XAI_API_KEY) return "grok";
  return "anthropic";
}

/** The active { provider, model }, for display (e.g. the startup banner). */
export function activeLLM() {
  const provider = resolveProvider();
  const model =
    provider === "grok"
      ? process.env.GROK_MODEL || DEFAULT_GROK_MODEL
      : process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  return { provider, model };
}

// Clients are created lazily so importing this module never requires a key or
// the optional `openai` package unless the matching provider is actually used.
let anthropicClient;
function getAnthropic() {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

let grokClient;
async function getGrok() {
  if (!grokClient) {
    const { default: OpenAI } = await import("openai");
    grokClient = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: GROK_BASE_URL });
  }
  return grokClient;
}

const SYSTEM_PROMPT = `You are an autonomous on-chain agent running on XDC Network.
Your job is to parse natural language instructions into a structured intent.

Respond ONLY with a raw JSON object — no markdown, no backticks, no explanation:

{
  "action": "transfer" | "swap" | "balance" | "help" | "unclear",
  "to": "<recipient address (xdc or 0x format) for transfers, else null>",
  "token": "<token symbol to send, e.g. XDC or USDC; for transfers>",
  "fromToken": "<token symbol to swap FROM, for swaps, else null>",
  "toToken": "<token symbol to swap TO, for swaps, else null>",
  "amount": <positive number or null>,
  "message": "<brief, friendly summary of what you understood>",
  "error": "<if unclear or invalid, describe what is missing or wrong>"
}

Rules:
- action "transfer": user wants to send a token — must have 'to', 'amount', and 'token'.
    If the user names no token, default 'token' to "USDC".
    "Send 5 XDC to ..." → token "XDC" (native coin). "Send 10 USDT to ..." → token "USDT".
- action "swap": user wants to exchange one token for another — must have 'fromToken', 'toToken', and 'amount'.
    "Swap 100 USDC to XDC" → fromToken "USDC", toToken "XDC", amount 100.
- action "balance": user asking about balances, wallet address, or account info.
- action "help": user asking how to use the agent or what it can do.
- action "unclear": required fields missing, ambiguous, an unknown token, or instruction doesn't make sense.
- Only use token symbols from the SUPPORTED TOKENS list below. If the user names a token not in that
  list, return action "unclear" with an error naming the unsupported token.
- Preserve the original address format (xdc... or 0x...) in the 'to' field.
- Amount must be a positive number; reject zero or negative.
- Never invent or guess an address.
- Keep 'message' short (1 sentence).`;

/**
 * Parses a natural language instruction into a structured intent, using whichever
 * LLM provider is active (Anthropic Claude or xAI Grok — see resolveProvider()).
 *
 * @param {string} userInstruction
 * @param {object} context  - { walletAddress, tokens: [{ symbol, balance }] }
 * @returns {object} parsed intent
 */
export async function parseInstruction(userInstruction, context = {}) {
  const tokens = context.tokens || [];
  const tokenList = tokens.length
    ? tokens.map((t) => `${t.symbol} (balance: ${t.balance})`).join(", ")
    : "none";
  const contextNote =
    `\n\nSUPPORTED TOKENS: ${tokenList}` +
    (context.walletAddress ? `\nCurrent wallet: ${context.walletAddress}` : "");

  const system = SYSTEM_PROMPT + contextNote;
  let raw;

  if (resolveProvider() === "grok") {
    // Grok speaks the OpenAI-compatible Chat Completions API; force JSON output.
    const grok = await getGrok();
    const response = await grok.chat.completions.create({
      model: process.env.GROK_MODEL || DEFAULT_GROK_MODEL,
      max_tokens: 512,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userInstruction },
      ],
    });
    raw = response.choices?.[0]?.message?.content || "{}";
  } else {
    const response = await getAnthropic().messages.create({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: "user", content: userInstruction }],
    });
    raw = response.content.find((b) => b.type === "text")?.text || "{}";
  }

  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return {
      action: "unclear",
      to: null,
      amount: null,
      message: "Could not parse your instruction.",
      error: "AI returned an unexpected format. Please rephrase.",
    };
  }
}
