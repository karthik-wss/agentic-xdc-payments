import { describe, it, expect, vi, afterEach } from "vitest";

// Control what the mocked LLMs return per test.
const state = vi.hoisted(() => ({ text: "{}" }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor() {
      this.messages = {
        create: async () => ({ content: [{ type: "text", text: state.text }] }),
      };
    }
  },
}));

// Grok speaks the OpenAI-compatible Chat Completions API.
vi.mock("openai", () => ({
  default: class {
    constructor() {
      this.chat = {
        completions: {
          create: async () => ({ choices: [{ message: { content: state.text } }] }),
        },
      };
    }
  },
}));

import { parseInstruction } from "../src/parser.js";

describe("parseInstruction (Anthropic, default)", () => {
  it("parses a raw JSON intent", async () => {
    state.text = JSON.stringify({ action: "transfer", to: "xdc1", token: "USDC", amount: 10 });
    const intent = await parseInstruction("send 10 usdc to xdc1");
    expect(intent.action).toBe("transfer");
    expect(intent.amount).toBe(10);
  });

  it("strips ```json fences before parsing", async () => {
    state.text = "```json\n{ \"action\": \"balance\" }\n```";
    const intent = await parseInstruction("what's my balance");
    expect(intent.action).toBe("balance");
  });

  it("falls back to 'unclear' on unparseable output", async () => {
    state.text = "I'm not going to give you JSON, sorry!";
    const intent = await parseInstruction("???");
    expect(intent.action).toBe("unclear");
    expect(intent.error).toMatch(/unexpected format/i);
  });
});

describe("parseInstruction (Grok)", () => {
  afterEach(() => {
    delete process.env.LLM_PROVIDER;
  });

  it("uses Grok when LLM_PROVIDER=grok and parses its JSON output", async () => {
    process.env.LLM_PROVIDER = "grok";
    state.text = JSON.stringify({ action: "swap", fromToken: "USDC", toToken: "XDC", amount: 100 });
    const intent = await parseInstruction("swap 100 usdc to xdc");
    expect(intent.action).toBe("swap");
    expect(intent.fromToken).toBe("USDC");
    expect(intent.amount).toBe(100);
  });

  it("falls back to 'unclear' on unparseable Grok output", async () => {
    process.env.LLM_PROVIDER = "grok";
    state.text = "not json at all";
    const intent = await parseInstruction("???");
    expect(intent.action).toBe("unclear");
    expect(intent.error).toMatch(/unexpected format/i);
  });
});
