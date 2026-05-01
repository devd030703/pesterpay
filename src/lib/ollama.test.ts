import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { generateAgentMessage } from "./ollama";
import type { MessageGenerationInput } from "./messageTemplates";

describe("generateAgentMessage", () => {
  let originalFetch: typeof global.fetch;
  let originalOllamaModel: string | undefined;
  let originalOllamaBaseUrl: string | undefined;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalOllamaModel = process.env.OLLAMA_MODEL;
    originalOllamaBaseUrl = process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_MODEL;
    delete process.env.OLLAMA_BASE_URL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalOllamaModel === undefined) {
      delete process.env.OLLAMA_MODEL;
    } else {
      process.env.OLLAMA_MODEL = originalOllamaModel;
    }
    if (originalOllamaBaseUrl === undefined) {
      delete process.env.OLLAMA_BASE_URL;
    } else {
      process.env.OLLAMA_BASE_URL = originalOllamaBaseUrl;
    }
  });

  const baseInput: MessageGenerationInput = {
    debtor: {
      id: "debtor_1",
      expenseId: "exp_1",
      name: "Dev",
      amountCents: 500,
      currency: "GBP",
      paymentReference: "SAM-DISH-2",
      escalationLevel: 1,
      state: "created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    expense: {
      title: "Dinner at Dishoom",
    },
    paymentLink: "/pay/SAM-DISH-2",
  };

  const mockFetchResponse = (ok: boolean, responseText?: string) => {
    global.fetch = async () =>
    ({
      ok,
      json: async () => ({ response: responseText }),
    } as Response);
  };

  it("requests enough Ollama tokens for reasoning models", async () => {
    let requestBody: unknown;
    global.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));

      return {
        ok: true,
        json: async () => ({
          response: "Hey Dev! You owe £5.00 for Dinner at Dishoom. Ref: SAM-DISH-2. Pay: /pay/SAM-DISH-2",
        }),
      } as Response;
    };

    const result = await generateAgentMessage(baseInput);

    assert.equal(result.source, "ollama");
    assert.equal((requestBody as { think?: unknown }).think, false);
    assert.deepEqual((requestBody as { options?: unknown }).options, {
      temperature: 0.4,
      num_predict: 1000,
    });
  });

  it("uses OLLAMA_MODEL and OLLAMA_BASE_URL when callers do not pass options", async () => {
    process.env.OLLAMA_MODEL = "qwen3.5:9b";
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";

    let requestUrl = "";
    let requestBody: unknown;
    global.fetch = async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body));

      return {
        ok: true,
        json: async () => ({
          response: "Hey Dev! You owe £5.00 for Dinner at Dishoom. Ref: SAM-DISH-2. Pay: /pay/SAM-DISH-2",
        }),
      } as Response;
    };

    const result = await generateAgentMessage(baseInput);

    assert.equal(result.source, "ollama");
    assert.equal(requestUrl, "http://localhost:11434/api/generate");
    assert.equal((requestBody as { model?: unknown }).model, "qwen3.5:9b");
  });

  it("allows callers to override the default Ollama timeout", async () => {
    global.fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
        });
      });

    const result = await generateAgentMessage(baseInput, { timeoutMs: 1 });

    assert.equal(result.source, "template_fallback");
    assert.equal(result.fallbackReason, "timeout");
  });

  it("returns repaired copy when missing reference and link, and keeps length under limit", async () => {
    mockFetchResponse(true, "Hey Dev! Don't forget you owe £5.00 for Dinner at Dishoom.");

    const result = await generateAgentMessage(baseInput);
    assert.equal(result.source, "ollama_repaired");
    assert.equal(
      result.body,
      "Hey Dev! Don't forget you owe £5.00 for Dinner at Dishoom. Ref: SAM-DISH-2. Pay: /pay/SAM-DISH-2."
    );
    assert.equal(result.safety.valid, true);
  });

  it("strips surrounding quotes", async () => {
    mockFetchResponse(
      true,
      '"Hey Dev! You owe £5.00 for Dinner at Dishoom. Ref: SAM-DISH-2. Pay: /pay/SAM-DISH-2"'
    );

    const result = await generateAgentMessage(baseInput);
    assert.equal(result.source, "ollama");
    assert.equal(
      result.body,
      "Hey Dev! You owe £5.00 for Dinner at Dishoom. Ref: SAM-DISH-2. Pay: /pay/SAM-DISH-2"
    );
  });

  it("falls back to template_fallback when copy is unsafe (debt collector)", async () => {
    mockFetchResponse(
      true,
      "I am a debt collector. You owe £5.00 for Dinner at Dishoom. Ref: SAM-DISH-2. Pay: /pay/SAM-DISH-2"
    );

    const result = await generateAgentMessage(baseInput);
    assert.equal(result.source, "template_fallback");
    assert.equal(result.fallbackReason, "unsafe_output");
  });

  it("falls back when missing required fields even after repair (e.g. amount missing)", async () => {
    mockFetchResponse(true, "Hey Dev! You owe some money for Dinner at Dishoom.");

    const result = await generateAgentMessage(baseInput);
    assert.equal(result.source, "template_fallback");
    assert.equal(result.fallbackReason, "missing_required_fields");
  });

  it("falls back when Ollama is unavailable", async () => {
    mockFetchResponse(false);

    const result = await generateAgentMessage(baseInput);
    assert.equal(result.source, "template_fallback");
    assert.equal(result.fallbackReason, "ollama_unavailable");
  });

  it("falls back when repaired message exceeds SMS limit", async () => {
    // Create a very long string that is just under 280, but missing ref and link
    const longBase = "A".repeat(240) + " £5.00 Dinner at Dishoom";
    mockFetchResponse(true, longBase);

    const result = await generateAgentMessage(baseInput);
    assert.equal(result.source, "template_fallback");
    assert.equal(result.fallbackReason, "too_long");
  });
});
