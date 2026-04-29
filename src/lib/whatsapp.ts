import { DEMO_MAX_MESSAGES_PER_DEBTOR, isTwilioWhatsAppConfigured } from "./demoSafety";
import { listEvents, logEvent } from "./events";
import { validateMessageSafety, type GeneratedMessage } from "./messageTemplates";
import type { Debtor, EventType, Expense } from "./models";
import { buildPublicDemoPaymentLink } from "./twilio";

export type TwilioWhatsAppResult =
  | {
      status: "sent";
      ok: true;
      message: string;
      to: string;
      providerMessageSid?: string;
    }
  | {
      status: "skipped";
      ok: true;
      message: string;
      reason:
        | "twilio_whatsapp_not_configured"
        | "demo_message_limit_reached"
        | "non_demo_recipient"
        | "unsafe_message";
    }
  | {
      status: "failed";
      ok: false;
      message: string;
      reason: "twilio_whatsapp_request_failed";
      providerStatus?: number;
    };

export type SendDemoWhatsAppInput = {
  debtor: Debtor;
  expense?: Pick<Expense, "title">;
  generatedMessage: GeneratedMessage;
  fetchImpl?: typeof fetch;
};

type TwilioMessageResponse = {
  sid?: string;
  message?: string;
};

const skippedEventTypes: Record<Extract<TwilioWhatsAppResult, { status: "skipped" }>["reason"], EventType> = {
  twilio_whatsapp_not_configured: "TWILIO_WHATSAPP_SKIPPED_NOT_CONFIGURED",
  demo_message_limit_reached: "TWILIO_WHATSAPP_SKIPPED_DEMO_LIMIT",
  non_demo_recipient: "TWILIO_WHATSAPP_SKIPPED_NON_DEMO_RECIPIENT",
  unsafe_message: "TWILIO_WHATSAPP_SKIPPED_UNSAFE_MESSAGE",
};

function isSamDemoDebtor(debtor: Debtor): boolean {
  return debtor.name.trim().toLowerCase() === "sam" && debtor.paymentReference === "SAM-DISH-32";
}

function countSentWhatsAppMessagesForDebtor(debtorId: string): number {
  return listEvents(debtorId).filter(
    (event) => event.eventType === "TWILIO_WHATSAPP_SENT" || event.eventType === "TWILIO_SMS_SENT",
  ).length;
}

function logWhatsAppSkipped(
  debtor: Debtor,
  reason: Extract<TwilioWhatsAppResult, { status: "skipped" }>["reason"],
  message: string,
) {
  logEvent({
    entityType: "debtor",
    entityId: debtor.id,
    eventType: skippedEventTypes[reason],
    message,
    metadata: {
      reason,
      paymentReference: debtor.paymentReference,
      sentCount: countSentWhatsAppMessagesForDebtor(debtor.id),
      maxMessages: DEMO_MAX_MESSAGES_PER_DEBTOR,
    },
  });
}

function getTwilioWhatsAppCredentials() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_WHATSAPP_FROM,
    demoSamWhatsAppNumber: process.env.DEMO_SAM_WHATSAPP_NUMBER,
    statusCallback: process.env.TWILIO_WHATSAPP_STATUS_CALLBACK,
  };
}

export async function sendDemoWhatsApp(input: SendDemoWhatsAppInput): Promise<TwilioWhatsAppResult> {
  const { debtor, generatedMessage } = input;
  const body = generatedMessage.body;

  logEvent({
    entityType: "debtor",
    entityId: debtor.id,
    eventType: "TWILIO_WHATSAPP_SEND_ATTEMPTED",
    message: `WhatsApp send considered for ${debtor.name}.`,
    metadata: {
      paymentReference: debtor.paymentReference,
      messageSource: generatedMessage.source,
      messageLength: body.length,
    },
  });

  const safety = validateMessageSafety(body, {
    debtor,
    expense: input.expense,
    escalationLevel: generatedMessage.escalationLevel,
    paymentLink: buildPublicDemoPaymentLink(debtor.paymentReference),
    policy: generatedMessage.policy,
    channel: "sms",
  });

  if (!generatedMessage.safety.valid || !safety.valid || generatedMessage.channel !== "sms") {
    const message = `WhatsApp skipped for ${debtor.name}: generated message failed safety validation.`;
    logWhatsAppSkipped(debtor, "unsafe_message", message);
    return { status: "skipped", ok: true, reason: "unsafe_message", message };
  }

  if (!isSamDemoDebtor(debtor)) {
    const message = `WhatsApp skipped for ${debtor.name}: live demo sending is restricted to Sam.`;
    logWhatsAppSkipped(debtor, "non_demo_recipient", message);
    return { status: "skipped", ok: true, reason: "non_demo_recipient", message };
  }

  if (countSentWhatsAppMessagesForDebtor(debtor.id) >= DEMO_MAX_MESSAGES_PER_DEBTOR) {
    const message = `WhatsApp skipped for ${debtor.name}: demo message limit reached.`;
    logWhatsAppSkipped(debtor, "demo_message_limit_reached", message);
    return { status: "skipped", ok: true, reason: "demo_message_limit_reached", message };
  }

  if (!isTwilioWhatsAppConfigured()) {
    const message = `WhatsApp skipped for ${debtor.name}: Twilio WhatsApp is not configured.`;
    logWhatsAppSkipped(debtor, "twilio_whatsapp_not_configured", message);
    return { status: "skipped", ok: true, reason: "twilio_whatsapp_not_configured", message };
  }

  const { accountSid, authToken, from, demoSamWhatsAppNumber, statusCallback } = getTwilioWhatsAppCredentials();
  if (!accountSid || !authToken || !from || !demoSamWhatsAppNumber) {
    const message = `WhatsApp skipped for ${debtor.name}: Twilio WhatsApp is not configured.`;
    logWhatsAppSkipped(debtor, "twilio_whatsapp_not_configured", message);
    return { status: "skipped", ok: true, reason: "twilio_whatsapp_not_configured", message };
  }

  const requestBody = new URLSearchParams({
    To: demoSamWhatsAppNumber,
    From: from,
    Body: body,
  });

  if (statusCallback) {
    requestBody.set("StatusCallback", statusCallback);
  }

  const response = await (input.fetchImpl ?? fetch)(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: requestBody,
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    const message = `WhatsApp failed for ${debtor.name}: Twilio returned ${response.status}.`;
    logEvent({
      entityType: "debtor",
      entityId: debtor.id,
      eventType: "TWILIO_WHATSAPP_FAILED",
      message,
      metadata: {
        providerStatus: response.status,
        providerMessage: payload.slice(0, 300),
        paymentReference: debtor.paymentReference,
      },
    });

    return {
      status: "failed",
      ok: false,
      reason: "twilio_whatsapp_request_failed",
      providerStatus: response.status,
      message,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as TwilioMessageResponse;
  const message = `WhatsApp sent to opted-in demo recipient for ${debtor.name}.`;

  logEvent({
    entityType: "debtor",
    entityId: debtor.id,
    eventType: "TWILIO_WHATSAPP_SENT",
    message,
    metadata: {
      to: "DEMO_SAM_WHATSAPP_NUMBER",
      providerMessageSid: payload.sid,
      paymentReference: debtor.paymentReference,
    },
  });

  return {
    status: "sent",
    ok: true,
    to: demoSamWhatsAppNumber,
    providerMessageSid: payload.sid,
    message,
  };
}
