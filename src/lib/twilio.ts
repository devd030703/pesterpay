import { DEMO_MAX_MESSAGES_PER_DEBTOR, isTwilioConfigured } from "./demoSafety";
import { listEvents, logEvent } from "./events";
import { validateMessageSafety, type GeneratedMessage } from "./messageTemplates";
import type { Debtor, EventType, Expense } from "./models";

export type TwilioSmsResult =
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
        | "twilio_not_configured"
        | "demo_message_limit_reached"
        | "non_demo_recipient"
        | "unsafe_message";
    }
  | {
      status: "failed";
      ok: false;
      message: string;
      reason: "twilio_request_failed";
      providerStatus?: number;
    };

export type SendDemoSmsInput = {
  debtor: Debtor;
  expense?: Pick<Expense, "title">;
  generatedMessage: GeneratedMessage;
  fetchImpl?: typeof fetch;
};

type TwilioMessageResponse = {
  sid?: string;
  message?: string;
};

const skippedEventTypes: Record<Extract<TwilioSmsResult, { status: "skipped" }>["reason"], EventType> = {
  twilio_not_configured: "TWILIO_SMS_SKIPPED_NOT_CONFIGURED",
  demo_message_limit_reached: "TWILIO_SMS_SKIPPED_DEMO_LIMIT",
  non_demo_recipient: "TWILIO_SMS_SKIPPED_NON_DEMO_RECIPIENT",
  unsafe_message: "TWILIO_SMS_SKIPPED_UNSAFE_MESSAGE",
};

function isSamDemoDebtor(debtor: Debtor): boolean {
  return debtor.name.trim().toLowerCase() === "sam" && debtor.paymentReference === "SAM-DISH-32";
}

function countSentSmsForDebtor(debtorId: string): number {
  return listEvents(debtorId).filter((event) => event.eventType === "TWILIO_SMS_SENT").length;
}

function logSmsSkipped(debtor: Debtor, reason: Extract<TwilioSmsResult, { status: "skipped" }>["reason"], message: string) {
  logEvent({
    entityType: "debtor",
    entityId: debtor.id,
    eventType: skippedEventTypes[reason],
    message,
    metadata: {
      reason,
      paymentReference: debtor.paymentReference,
      sentCount: countSentSmsForDebtor(debtor.id),
      maxMessages: DEMO_MAX_MESSAGES_PER_DEBTOR,
    },
  });
}

function getTwilioCredentials() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_PHONE_NUMBER,
    demoSamPhoneNumber: process.env.DEMO_SAM_PHONE_NUMBER,
  };
}

export function buildPublicDemoPaymentLink(reference: string): string {
  const path = `/pay/${encodeURIComponent(reference)}`;
  const baseUrl = process.env.NEXT_PUBLIC_DEMO_BASE_URL?.replace(/\/$/, "");
  return baseUrl ? `${baseUrl}${path}` : path;
}

export async function sendDemoSms(input: SendDemoSmsInput): Promise<TwilioSmsResult> {
  const { debtor, generatedMessage } = input;
  const body = generatedMessage.body;

  logEvent({
    entityType: "debtor",
    entityId: debtor.id,
    eventType: "TWILIO_SMS_SEND_ATTEMPTED",
    message: `SMS send considered for ${debtor.name}.`,
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
    const message = `SMS skipped for ${debtor.name}: generated message failed safety validation.`;
    logSmsSkipped(debtor, "unsafe_message", message);
    return { status: "skipped", ok: true, reason: "unsafe_message", message };
  }

  if (!isSamDemoDebtor(debtor)) {
    const message = `SMS skipped for ${debtor.name}: live demo sending is restricted to Sam.`;
    logSmsSkipped(debtor, "non_demo_recipient", message);
    return { status: "skipped", ok: true, reason: "non_demo_recipient", message };
  }

  if (countSentSmsForDebtor(debtor.id) >= DEMO_MAX_MESSAGES_PER_DEBTOR) {
    const message = `SMS skipped for ${debtor.name}: demo message limit reached.`;
    logSmsSkipped(debtor, "demo_message_limit_reached", message);
    return { status: "skipped", ok: true, reason: "demo_message_limit_reached", message };
  }

  if (!isTwilioConfigured()) {
    const message = `SMS skipped for ${debtor.name}: Twilio is not configured.`;
    logSmsSkipped(debtor, "twilio_not_configured", message);
    return { status: "skipped", ok: true, reason: "twilio_not_configured", message };
  }

  const { accountSid, authToken, from, demoSamPhoneNumber } = getTwilioCredentials();
  if (!accountSid || !authToken || !from || !demoSamPhoneNumber) {
    const message = `SMS skipped for ${debtor.name}: Twilio is not configured.`;
    logSmsSkipped(debtor, "twilio_not_configured", message);
    return { status: "skipped", ok: true, reason: "twilio_not_configured", message };
  }

  const requestBody = new URLSearchParams({
    To: demoSamPhoneNumber,
    From: from,
    Body: body,
  });

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
    const message = `SMS failed for ${debtor.name}: Twilio returned ${response.status}.`;
    logEvent({
      entityType: "debtor",
      entityId: debtor.id,
      eventType: "TWILIO_SMS_FAILED",
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
      reason: "twilio_request_failed",
      providerStatus: response.status,
      message,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as TwilioMessageResponse;
  const message = `SMS sent to opted-in demo recipient for ${debtor.name}.`;

  logEvent({
    entityType: "debtor",
    entityId: debtor.id,
    eventType: "TWILIO_SMS_SENT",
    message,
    metadata: {
      to: "DEMO_SAM_PHONE_NUMBER",
      providerMessageSid: payload.sid,
      paymentReference: debtor.paymentReference,
    },
  });

  return {
    status: "sent",
    ok: true,
    to: demoSamPhoneNumber,
    providerMessageSid: payload.sid,
    message,
  };
}
