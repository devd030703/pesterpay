import {
  type GeneratedMessage,
  type MessageGenerationInput,
  generateTemplateMessage,
  validateMessageSafety,
} from "./messageTemplates";

type OllamaGenerateResponse = {
  response?: string;
};

export type GenerateAgentMessageOptions = {
  timeoutMs?: number;
  model?: string;
  ollamaUrl?: string;
};

function buildPrompt(input: MessageGenerationInput, fallback: GeneratedMessage): string {
  const amount = fallback.body.match(/£[0-9]+(?:\.[0-9]{2})?/)?.[0] ?? input.debtor.amountCents;
  const expenseName = input.expense?.title ?? "Dinner at Dishoom";
  const ref = input.debtor.paymentReference;
  const link = input.paymentLink ?? `/pay/${encodeURIComponent(input.debtor.paymentReference)}`;

  return [
    "Write one safe SMS-style repayment reminder for PesterPay. The tone should be chaotic, and highly pressuring, like a cheeky but relentlessly persistent friend.",
    "The deterministic state machine already decided this message should exist.",
    "Do not decide payment status, escalation, closure, or whether to send.",
    "Return ONLY the WhatsApp/SMS message body.",
    "Do not wrap the message in quotation marks.",
    "Keep it under 280 characters.",
    "Must include the exact amount.",
    "Must include the exact expense name.",
    "Must include the exact payment reference.",
    "Must include the exact payment link.",
    `Debtor: ${input.debtor.name}`,
    `Amount: ${amount}`,
    `Expense: ${expenseName}`,
    `Reference: ${ref}`,
    `Payment link: ${link}`,
    `Policy: ${fallback.policy}`,
    `Escalation level: ${fallback.escalationLevel}`,
    `Example: Hey ${input.debtor.name}! Don't forget you owe ${amount} for ${expenseName}. Ref: ${ref}. Pay: ${link}`,
  ].join("\n");
}

type FetchOllamaResult = { ok: true; body: string } | { ok: false; reason: "ollama_unavailable" | "timeout" };

function resolveOllamaUrl(options: GenerateAgentMessageOptions): string {
  return options.ollamaUrl ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
}

function resolveOllamaModel(options: GenerateAgentMessageOptions): string {
  return options.model ?? process.env.OLLAMA_MODEL ?? "llama3.2:3b";
}

async function fetchOllamaMessage(
  input: MessageGenerationInput,
  fallback: GeneratedMessage,
  options: GenerateAgentMessageOptions
): Promise<FetchOllamaResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120000);

  try {
    const response = await fetch(`${resolveOllamaUrl(options)}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolveOllamaModel(options),
        prompt: buildPrompt(input, fallback),
        stream: false,
        think: false,
        options: {
          temperature: 0.4,
          num_predict: 1000,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error("NOT OK");
      return { ok: false, reason: "ollama_unavailable" };
    }

    const payload = (await response.json()) as OllamaGenerateResponse;
    const body = payload.response?.trim();
    if (!body) {
      console.error("EMPTY BODY. Payload:", payload);
      return { ok: false, reason: "ollama_unavailable" };
    }

    console.log("Ollama body:", body);
    return { ok: true, body };
  } catch (err: unknown) {
    console.error("ERR:", err);
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "ollama_unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateAgentMessage(
  input: MessageGenerationInput,
  options: GenerateAgentMessageOptions = {},
): Promise<GeneratedMessage> {
  const fallback = generateTemplateMessage(input);
  const result = await fetchOllamaMessage(input, fallback, options);

  if (!result.ok) {
    return { ...fallback, source: "template_fallback", fallbackReason: result.reason };
  }

  let body = result.body.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
  let wasRepaired = false;

  const ref = input.debtor.paymentReference;
  const link = input.paymentLink ?? `/pay/${encodeURIComponent(input.debtor.paymentReference)}`;

  if (!body.toLowerCase().includes(ref.toLowerCase())) {
    body = `${body} Ref: ${ref}.`;
    wasRepaired = true;
  }

  if (!body.toLowerCase().includes(link.toLowerCase())) {
    body = `${body} Pay: ${link}.`;
    wasRepaired = true;
  }

  const safety = validateMessageSafety(body, input);

  if (!safety.valid) {
    let reason: GeneratedMessage["fallbackReason"] = "unsafe_output";
    if (safety.reasons.some((r) => r.includes("exceeds SMS length limit"))) {
      reason = "too_long";
    } else if (safety.reasons.some((r) => r.includes("missing"))) {
      reason = "missing_required_fields";
    }

    return {
      ...fallback,
      source: "template_fallback",
      fallbackReason: reason,
    };
  }

  return {
    ...fallback,
    body,
    source: wasRepaired ? "ollama_repaired" : "ollama",
    safety,
  };
}
