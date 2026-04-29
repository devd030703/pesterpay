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
  return [
    "Write one safe SMS-style repayment reminder for PesterPay.",
    "The deterministic state machine already decided this message should exist.",
    "Do not decide payment status, escalation, closure, or whether to send.",
    "Keep it under 280 characters.",
    "Include the exact amount, expense reason, payment reference, and payment link.",
    "Avoid threats, harassment, blackmail, slurs, legal claims, public shaming, and impersonating a bank, regulator, solicitor, or debt collector.",
    `Debtor: ${input.debtor.name}`,
    `Amount: ${fallback.body.match(/£[0-9]+(?:\.[0-9]{2})?/)?.[0] ?? input.debtor.amountCents}`,
    `Expense: ${input.expense?.title ?? "Dinner at Dishoom"}`,
    `Reference: ${input.debtor.paymentReference}`,
    `Payment link: ${input.paymentLink ?? `/pay/${encodeURIComponent(input.debtor.paymentReference)}`}`,
    `Policy: ${fallback.policy}`,
    `Escalation level: ${fallback.escalationLevel}`,
    "Return only the message body.",
  ].join("\n");
}

async function fetchOllamaMessage(input: MessageGenerationInput, fallback: GeneratedMessage, options: GenerateAgentMessageOptions) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1200);

  try {
    const response = await fetch(`${options.ollamaUrl ?? "http://127.0.0.1:11434"}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model ?? "llama3.2",
        prompt: buildPrompt(input, fallback),
        stream: false,
        options: {
          temperature: 0.4,
          num_predict: 90,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as OllamaGenerateResponse;
    return payload.response?.trim();
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateAgentMessage(
  input: MessageGenerationInput,
  options: GenerateAgentMessageOptions = {},
): Promise<GeneratedMessage> {
  const fallback = generateTemplateMessage(input);
  const body = await fetchOllamaMessage(input, fallback, options);

  if (!body) {
    return fallback;
  }

  const normalizedBody = body.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
  const safety = validateMessageSafety(normalizedBody, input);

  if (!safety.valid) {
    return fallback;
  }

  return {
    ...fallback,
    body: normalizedBody,
    source: "ollama",
    safety,
  };
}
