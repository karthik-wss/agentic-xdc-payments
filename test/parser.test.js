import { describe, it, expect, vi } from "vitest";

// Control what the mocked Claude returns per test.
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

import { parseInstruction } from "../src/parser.js";

describe("parseInstruction", () => {
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
