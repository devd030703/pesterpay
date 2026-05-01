import { listEvents, logEvent } from "./events";
import { isStarlingConfigured } from "./demoSafety";
import { type MessagePolicy } from "./messageTemplates";
import type { Debtor, DebtorState } from "./models";
import { reconcileStarlingSettledTransactions, type ReconcileStarlingSettledTransactionsResult } from "./payments";
import type { StarlingFeedItem } from "./starling";
import { getDebtor, getExpense, listDebtors, saveDebtor } from "./store";
import { generateAgentMessage } from "./ollama";
import { transitionDebtor } from "./stateMachine";
import { buildPublicDemoPaymentLink, sendDemoSms, type TwilioSmsResult } from "./twilio";
import { sendVoiceCall, type VoiceCallResult } from "./voice";
import { sendDemoWhatsApp, type TwilioWhatsAppResult } from "./whatsapp";

const coreDemoAdvance: Partial<Record<DebtorState, DebtorState>> = {
  created: "sms_1_sent",
  sms_1_sent: "sms_2_sent",
  sms_2_sent: "call_triggered",
};

export type AgentTickInput = {
  debtorId?: string;
  policy?: MessagePolicy;
  starlingFeedItems?: StarlingFeedItem[];
};

export type AgentTickResult =
  | {
    ok: true;
    debtor?: Debtor;
    advanced?: boolean;
    message: string;
    generatedMessage?: string;
    sms?: TwilioSmsResult;
    voice?: VoiceCallResult;
    whatsapp?: TwilioWhatsAppResult;
    starling?: ReconcileStarlingSettledTransactionsResult;
  }
  | {
    ok: false;
    message: string;
  };

export async function agentTick(input: AgentTickInput = {}): Promise<AgentTickResult> {
  let debtors = listDebtors();

  if (debtors.length === 0) {
    return {
      ok: false,
      message: "No debtors found. Please seed demo data first.",
    };
  }

  let starling: ReconcileStarlingSettledTransactionsResult | undefined;
  const shouldPollStarling = isStarlingConfigured() || input.starlingFeedItems;

  if (shouldPollStarling) {
    try {
      starling = await reconcileStarlingSettledTransactions({
        feedItems: input.starlingFeedItems,
        expectedAmountCents: debtors
          .filter((candidate) => candidate.state !== "closed")
          .reduce((sum, candidate) => sum + candidate.amountCents, 0),
      });
      debtors = listDebtors();
    } catch {
      debtors = listDebtors();
    }
  }

  const debtor = input.debtorId
    ? getDebtor(input.debtorId)
    : debtors.find((candidate) => coreDemoAdvance[candidate.state]);

  if (!debtor) {
    if (input.debtorId) {
      return { ok: false, message: `Debtor ${input.debtorId} not found.` };
    }
    return { ok: true, message: "All debts are successfully resolved.", starling };
  }

  const to = coreDemoAdvance[debtor.state];
  if (!to) {
    return {
      ok: true,
      debtor,
      advanced: false,
      starling,
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

  const sms =
    generated.channel === "sms"
      ? await sendDemoSms({
        debtor,
        expense,
        generatedMessage: generated,
      })
      : undefined;

  // Twilio trial accounts have a strict 1 request per second API limit.
  // Delay slightly before sending the WhatsApp message to avoid a 429 Too Many Requests error.
  if (generated.channel === "sms" && sms?.status === "sent") {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const whatsapp =
    generated.channel === "sms"
      ? await sendDemoWhatsApp({
        debtor,
        expense,
        generatedMessage: generated,
      })
      : undefined;

  const voice =
    generated.channel === "call_script"
      ? await sendVoiceCall({
        debtor,
        expense,
        generatedMessage: generated,
      })
      : undefined;

  // We intentionally do not abort the agent tick if a provider fails (e.g. 429 rate limits).
  // The state machine should advance so the demo can continue to the next escalation (e.g. voice).
  // The failure is already logged in the event timeline.

  const result = transitionDebtor({
    debtor,
    to,
    reason: "agent_tick",
    metadata: {
      actor: "deterministic_agent_tick",
      eventCountBeforeTick: listEvents(debtor.id).length,
      messageSource: generated.source,
      twilioSmsStatus: sms?.status,
      twilioSmsReason: sms?.status === "skipped" ? sms.reason : undefined,
      twilioWhatsAppStatus: whatsapp?.status,
      twilioWhatsAppReason: whatsapp?.status === "skipped" ? whatsapp.reason : undefined,
      voiceProvider: voice?.provider,
      voiceStatus: voice?.status,
      voiceReason: voice?.status === "skipped" ? voice.reason : undefined,
      voiceProviderCallId: voice?.status === "sent" ? voice.providerCallId : undefined,
      voiceProviderConversationId: voice?.status === "sent" ? voice.providerConversationId : undefined,
      voiceTo: voice?.status === "sent" ? voice.to : undefined,
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
    sms,
    voice,
    whatsapp,
    starling,
    message: `Advanced debtor ${debtor.id} from ${debtor.state} to ${to}.`,
  };
}
