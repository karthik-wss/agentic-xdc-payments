import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an autonomous USDC transfer agent running on XDC Network.
Your job is to parse natural language instructions and extract transfer details.

Respond ONLY with a raw JSON object — no markdown, no backticks, no explanation:

{
  "action": "transfer" | "balance" | "help" | "unclear",
  "to": "<recipient address (xdc or 0x format), or null>",
  "amount": <positive number or null>,
  "message": "<brief, friendly summary of what you understood>",
  "error": "<if unclear or invalid, describe what is missing or wrong>"
}

Rules:
- action "transfer": user wants to send USDC — must have both 'to' and 'amount'
- action "balance": user asking about balance, wallet address, or account info
- action "help": user asking how to use the agent or what it can do
- action "unclear": address or amount missing, ambiguous, or instruction doesn't make sense
- Preserve the original address format (xdc... or 0x...) in the 'to' field
- Amount must be a positive number; reject zero or negative
- Never invent or guess an address
- Keep 'message' short (1 sentence)`;

/**
 * Parses a natural language instruction using Claude AI.
 * Returns a structured intent object.
 *
 * @param {string} userInstruction
 * @param {object} context  - Optional: { xdcBalance, usdcBalance, walletAddress }
 * @returns {object} parsed intent
 */
export async function parseInstruction(userInstruction, context = {}) {
  const contextNote = context.usdcBalance
    ? `\n\nCurrent wallet context: address=${context.walletAddress}, XDC=${context.xdcBalance}, USDC=${context.usdcBalance}`
    : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT + contextNote,
    messages: [{ role: "user", content: userInstruction }],
  });

  const raw = response.content.find((b) => b.type === "text")?.text || "{}";

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
