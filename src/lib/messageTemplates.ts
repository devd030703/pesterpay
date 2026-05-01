import type { Debtor, Expense } from "./models";

export const messagePolicies = [
  "polite_british",
  "passive_aggressive_flatmate",
  "corporate_collections",
  "unhinged_goblin",
] as const;

export type MessagePolicy = (typeof messagePolicies)[number];

export type MessageChannel = "sms" | "call_script";

export type MessageGenerationInput = {
  debtor: Debtor;
  expense?: Pick<Expense, "title">;
  escalationLevel?: number;
  paymentLink?: string;
  policy?: MessagePolicy;
  channel?: MessageChannel;
};

export type GeneratedMessage = {
  body: string;
  source: "template" | "ollama" | "ollama_repaired" | "template_fallback";
  policy: MessagePolicy;
  channel: MessageChannel;
  escalationLevel: number;
  safety: {
    valid: boolean;
    reasons: string[];
  };
  fallbackReason?: "ollama_unavailable" | "unsafe_output" | "missing_required_fields" | "too_long" | "timeout";
};

const SMS_MAX_LENGTH = 280;
const DEFAULT_POLICY: MessagePolicy = "unhinged_goblin";
const DEFAULT_EXPENSE_TITLE = "Dinner at Dishoom";

const unsafePatterns = [
  /\bthreat(en|s|ening)?\b/i,
  /\bharass(ment|ing)?\b/i,
  /\bblackmail\b/i,
  /\bslur\b/i,
  /\bcourt\b/i,
  /\blawsuit\b/i,
  /\bsolicitor\b/i,
  /\bdebt collector\b/i,
  /\bregulator\b/i,
  /\bbank\b/i,
  /\bshame\b/i,
  /\bpublicly\b/i,
  /\bpolice\b/i,
];

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: string, maxLength: number): string {
  const compacted = compactWhitespace(value);
  return compacted.length <= maxLength ? compacted : compacted.slice(0, maxLength).trim();
}

export function formatMessageAmount(cents: number, currency: Debtor["currency"]): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function buildDemoPaymentLink(reference: string): string {
  return "https://settleup.starlingbank.com/samuel-hollis-994d22";
}

function normalizePolicy(policy?: MessagePolicy): MessagePolicy {
  return policy && messagePolicies.includes(policy) ? policy : DEFAULT_POLICY;
}

export function isMessagePolicy(value: string): value is MessagePolicy {
  return messagePolicies.includes(value as MessagePolicy);
}

function buildTemplateBody(input: RequiredMessageInput): string {
  const { debtor, amount, reason, reference, paymentLink, policy, escalationLevel, channel } = input;
  const linkText = paymentLink ? ` Pay: ${paymentLink}` : "";

  if (channel === "call_script") {
    return `Call ${debtor.name}: friendly reminder that ${amount} is due for ${reason}. Ask them to pay with ref ${reference}.${linkText}`;
  }

  if (policy === "polite_british") {
    return `Hi ${debtor.name}, gentle reminder you owe ${amount} for ${reason}. Please use ref ${reference}.${linkText} Thanks.`;
  }

  if (policy === "passive_aggressive_flatmate") {
    return `Hi ${debtor.name}, the ${reason} maths still says ${amount} is due. Please sort it with ref ${reference}.${linkText}`;
  }

  if (policy === "corporate_collections") {
    return `PesterPay reminder for ${debtor.name}: ${amount} remains due for ${reason}. Use payment ref ${reference}.${linkText}`;
  }

  const prefix =
    escalationLevel >= 3
      ? "Final demo nudge"
      : escalationLevel >= 2
        ? "Second demo nudge"
        : "Tiny goblin nudge";

  return `${prefix} for ${debtor.name}: ${amount} for ${reason} is still unpaid. Use ref ${reference}.${linkText}`;
}

type RequiredMessageInput = {
  debtor: Debtor;
  amount: string;
  reason: string;
  reference: string;
  paymentLink?: string;
  policy: MessagePolicy;
  escalationLevel: number;
  channel: MessageChannel;
};

function makeRequiredInput(input: MessageGenerationInput): RequiredMessageInput {
  return {
    debtor: input.debtor,
    amount: formatMessageAmount(input.debtor.amountCents, input.debtor.currency),
    reason: clip(input.expense?.title ?? DEFAULT_EXPENSE_TITLE, 48),
    reference: input.debtor.paymentReference,
    paymentLink: input.paymentLink ?? buildDemoPaymentLink(input.debtor.paymentReference),
    policy: normalizePolicy(input.policy),
    escalationLevel: input.escalationLevel ?? input.debtor.escalationLevel,
    channel: input.channel ?? "sms",
  };
}

export function validateMessageSafety(body: string, input: MessageGenerationInput): GeneratedMessage["safety"] {
  const required = makeRequiredInput(input);
  const normalizedBody = body.toLowerCase();
  const reasons: string[] = [];

  if (body.length > SMS_MAX_LENGTH) {
    reasons.push("Message exceeds SMS length limit.");
  }

  if (!normalizedBody.includes(required.amount.toLowerCase())) {
    reasons.push("Message is missing the amount owed.");
  }

  if (!normalizedBody.includes(required.reason.toLowerCase())) {
    reasons.push("Message is missing the expense reason.");
  }

  if (!normalizedBody.includes(required.reference.toLowerCase())) {
    reasons.push("Message is missing the payment reference.");
  }

  if (required.paymentLink && !body.includes(required.paymentLink)) {
    reasons.push("Message is missing the payment link.");
  }

  for (const pattern of unsafePatterns) {
    if (pattern.test(body)) {
      reasons.push("Message contains unsafe debt-collection language.");
      break;
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

export function generateTemplateMessage(input: MessageGenerationInput): GeneratedMessage {
  const required = makeRequiredInput(input);
  let body = compactWhitespace(buildTemplateBody(required));

  if (body.length > SMS_MAX_LENGTH) {
    const compactReason = clip(required.reason, 24);
    const linkText = required.paymentLink ? ` Pay: ${required.paymentLink}` : "";
    body = compactWhitespace(
      `${required.debtor.name}, please repay ${required.amount} for ${compactReason}. Ref: ${required.reference}.${linkText}`,
    );
  }

  return {
    body,
    source: "template",
    policy: required.policy,
    channel: required.channel,
    escalationLevel: required.escalationLevel,
    safety: validateMessageSafety(body, input),
  };
}

export { SMS_MAX_LENGTH };
