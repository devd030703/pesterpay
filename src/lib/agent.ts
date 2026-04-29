import { listEvents, logEvent } from "./events";
import { type MessagePolicy } from "./messageTemplates";
import type { Debtor, DebtorState } from "./models";
import { getDebtor, getExpense, listDebtors, saveDebtor } from "./store";
import { generateAgentMessage } from "./ollama";
import { transitionDebtor } from "./stateMachine";
import { buildPublicDemoPaymentLink } from "./twilio";
import { sendDemoWhatsApp, type TwilioWhatsAppResult } from "./whatsapp";

const coreDemoAdvance: Partial<Record<DebtorState, DebtorState>> = {
  created: "sms_1_sent",
  sms_1_sent: "sms_2_sent",
  sms_2_sent: "call_triggered",
};

export type AgentTickInput = {
  debtorId?: string;
  policy?: MessagePolicy;
};

export type AgentTickResult =
  | {
      ok: true;
      debtor?: Debtor;
      advanced?: boolean;
      message: string;
      generatedMessage?: string;
      whatsapp?: TwilioWhatsAppResult;
    }
  | {
      ok: false;
      message: string;
    };

export async function agentTick(input: AgentTickInput = {}): Promise<AgentTickResult> {
  const debtors = listDebtors();

  if (debtors.length === 0) {
    return {
      ok: false,
      message: "No debtors found. Please seed demo data first.",
    };
  }

  const debtor = input.debtorId
    ? getDebtor(input.debtorId)
    : debtors.find((candidate) => coreDemoAdvance[candidate.state]);

  if (!debtor) {
    if (input.debtorId) {
      return { ok: false, message: `Debtor ${input.debtorId} not found.` };
    }
    return { ok: true, message: "All debts are successfully resolved." };
  }

  const to = coreDemoAdvance[debtor.state];
  if (!to) {
    return {
      ok: true,
      debtor,
      advanced: false,
      message: `Debtor is in terminal or side state: ${debtor.state}.`,
    };
  }

  if (debtor.state === "sms_1_sent" || debtor.state === "sms_2_sent") {
    logEvent({
      entityType: "debtor",
      entityId: debtor.id,
      eventType: "PAYMENT_CHECK_NO_MATCH",
      message: `Payment checked for ${debtor.paymentReference}; no matching transaction found.`,
      metadata: {
        reference: debtor.paymentReference,
        amountCents: debtor.amountCents,
        reason: "agent_tick",
      },
    });
  }

  const expense = getExpense(debtor.expenseId);
  const generated = await generateAgentMessage(
    {
      debtor,
      expense,
      escalationLevel: to === "sms_1_sent" ? 1 : to === "sms_2_sent" ? 2 : to === "call_triggered" ? 3 : debtor.escalationLevel,
      paymentLink: buildPublicDemoPaymentLink(debtor.paymentReference),
      policy: input.policy,
      channel: to === "call_triggered" ? "call_script" : "sms",
    },
    {
      ollamaUrl: process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_MODEL,
      timeoutMs: 120000,
    }
  );

  logEvent({
    entityType: "debtor",
    entityId: debtor.id,
    eventType: "MESSAGE_GENERATED",
    message: generated.body,
    metadata: {
      source: generated.source,
      fallbackReason: generated.fallbackReason,
      policy: generated.policy,
      channel: generated.channel,
      escalationLevel: generated.escalationLevel,
      safetyValid: generated.safety.valid,
    },
  });

  const whatsapp =
    generated.channel === "sms"
      ? await sendDemoWhatsApp({
          debtor,
          expense,
          generatedMessage: generated,
        })
      : undefined;

  if (whatsapp?.status === "failed") {
    return {
      ok: false,
      message: whatsapp.message,
    };
  }

  const result = transitionDebtor({
    debtor,
    to,
    reason: "agent_tick",
    metadata: {
      actor: "deterministic_agent_tick",
      eventCountBeforeTick: listEvents(debtor.id).length,
      messageSource: generated.source,
      twilioWhatsAppStatus: whatsapp?.status,
      twilioWhatsAppReason: whatsapp?.status === "skipped" ? whatsapp.reason : undefined,
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.error,
    };
  }

  saveDebtor(result.debtor);

  return {
    ok: true,
    debtor: result.debtor,
    advanced: true,
    generatedMessage: generated.body,
    whatsapp,
    message: `Advanced debtor ${debtor.id} from ${debtor.state} to ${to}.`,
  };
}
