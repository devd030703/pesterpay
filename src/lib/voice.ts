import path from "node:path";
import { Vonage } from "@vonage/server-sdk";
import {
  DEMO_MAX_CALLS_PER_DEBTOR,
  isAllowedVoiceRecipient,
  isTwilioConfigured,
  isVonageVoiceConfigured,
} from "./demoSafety";
import { listEvents, logEvent } from "./events";
import { validateMessageSafety, type GeneratedMessage } from "./messageTemplates";
import type { Debtor, EventType, Expense } from "./models";
import { buildPublicDemoPaymentLink } from "./twilio";

export type VoiceProvider = "demo" | "vonage" | "twilio";

export type VoiceCallResult =
  | {
      status: "sent";
      ok: true;
      provider: VoiceProvider;
      message: string;
      to: string;
      providerCallId?: string;
      providerConversationId?: string;
    }
  | {
      status: "skipped";
      ok: true;
      provider: VoiceProvider | "unknown";
      message: string;
      reason:
        | "voice_demo_provider"
        | "voice_not_configured"
        | "demo_call_limit_reached"
        | "non_demo_recipient"
        | "unsafe_script"
        | "unsupported_voice_provider";
    }
  | {
      status: "failed";
      ok: false;
      provider: VoiceProvider;
      message: string;
      reason: "voice_request_failed";
      providerStatus?: number;
      providerMessage?: string;
    };

export type SendVoiceCallInput = {
  debtor: Debtor;
  expense?: Pick<Expense, "title">;
  generatedMessage: GeneratedMessage;
  to?: string;
  fetchImpl?: typeof fetch;
};

type VonageCreateCallResponse = {
  uuid?: string;
  conversationUuid?: string;
  conversation_uuid?: string;
};

const skippedEventTypes: Record<Extract<VoiceCallResult, { status: "skipped" }>["reason"], EventType> = {
  voice_demo_provider: "VOICE_CALL_SKIPPED_DEMO_PROVIDER",
  voice_not_configured: "VOICE_CALL_SKIPPED_NOT_CONFIGURED",
  demo_call_limit_reached: "VOICE_CALL_SKIPPED_DEMO_LIMIT",
  non_demo_recipient: "VOICE_CALL_SKIPPED_NON_DEMO_RECIPIENT",
  unsafe_script: "VOICE_CALL_SKIPPED_UNSAFE_SCRIPT",
  unsupported_voice_provider: "VOICE_CALL_SKIPPED_UNSUPPORTED_PROVIDER",
};

function getVoiceProvider(): VoiceProvider | "unknown" {
  const provider = process.env.VOICE_PROVIDER?.trim().toLowerCase() || "demo";
  if (provider === "vonage" || provider === "twilio" || provider === "demo") {
    return provider;
  }
  return "unknown";
}

function scriptPreview(script: string): string {
  const compact = script.replace(/\s+/g, " ").trim();
  return compact.length <= 140 ? compact : `${compact.slice(0, 137).trim()}...`;
}

function countSentVoiceCallsForDebtor(debtorId: string): number {
  return listEvents(debtorId).filter((event) => event.eventType === "VOICE_CALL_SENT").length;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function resolveDemoRecipient(input: SendVoiceCallInput): string | undefined {
  if (input.to) {
    return input.to;
  }

  if (input.debtor.name.trim().toLowerCase() === "dev") {
    return process.env.DEMO_SAM_PHONE_NUMBER ?? input.debtor.phone;
  }

  return input.debtor.phone;
}

function logVoiceSkipped(
  input: SendVoiceCallInput,
  provider: VoiceCallResult["provider"],
  reason: Extract<VoiceCallResult, { status: "skipped" }>["reason"],
  message: string,
  to?: string,
) {
  logEvent({
    entityType: "debtor",
    entityId: input.debtor.id,
    eventType: skippedEventTypes[reason],
    message,
    metadata: {
      provider,
      reason,
      to,
      paymentReference: input.debtor.paymentReference,
      sentCount: countSentVoiceCallsForDebtor(input.debtor.id),
      maxCalls: DEMO_MAX_CALLS_PER_DEBTOR,
      scriptPreview: scriptPreview(input.generatedMessage.body),
    },
  });
}

function getVonageCredentials() {
  const privateKeyPath = process.env.VONAGE_PRIVATE_KEY_PATH;
  return {
    applicationId: process.env.VONAGE_APPLICATION_ID,
    privateKey: privateKeyPath ? path.resolve(/* turbopackIgnore: true */ process.cwd(), privateKeyPath) : undefined,
    from: process.env.VONAGE_FROM_NUMBER,
  };
}

async function sendVonageVoiceCall(input: SendVoiceCallInput, to: string): Promise<VoiceCallResult> {
  if (!isVonageVoiceConfigured()) {
    const message = `Voice call skipped for ${input.debtor.name}: Vonage Voice is not configured.`;
    logVoiceSkipped(input, "vonage", "voice_not_configured", message, to);
    return { status: "skipped", ok: true, provider: "vonage", reason: "voice_not_configured", message };
  }

  const { applicationId, privateKey, from } = getVonageCredentials();
  if (!applicationId || !privateKey || !from) {
    const message = `Voice call skipped for ${input.debtor.name}: Vonage Voice is not configured.`;
    logVoiceSkipped(input, "vonage", "voice_not_configured", message, to);
    return { status: "skipped", ok: true, provider: "vonage", reason: "voice_not_configured", message };
  }

  try {
    const vonage = new Vonage({ applicationId, privateKey });
    const response = (await vonage.voice.createOutboundCall({
      to: [{ type: "phone", number: to }],
      from: { type: "phone", number: from },
      ncco: [
        {
          action: "talk",
          text: input.generatedMessage.body,
        },
      ],
    })) as VonageCreateCallResponse;

    const providerCallId = response.uuid;
    const providerConversationId = response.conversationUuid ?? response.conversation_uuid;
    const message = `Vonage voice call started for ${input.debtor.name}.`;

    logEvent({
      entityType: "debtor",
      entityId: input.debtor.id,
      eventType: "VOICE_CALL_SENT",
      message,
      metadata: {
        provider: "vonage",
        providerCallId,
        providerConversationId,
        to,
        paymentReference: input.debtor.paymentReference,
        scriptPreview: scriptPreview(input.generatedMessage.body),
      },
    });

    return {
      status: "sent",
      ok: true,
      provider: "vonage",
      to,
      providerCallId,
      providerConversationId,
      message,
    };
  } catch (error) {
    const message = `Voice call failed for ${input.debtor.name}: Vonage request failed.`;
    const providerMessage = error instanceof Error ? error.message : String(error);

    logEvent({
      entityType: "debtor",
      entityId: input.debtor.id,
      eventType: "VOICE_CALL_FAILED",
      message,
      metadata: {
        provider: "vonage",
        providerMessage: providerMessage.slice(0, 300),
        to,
        paymentReference: input.debtor.paymentReference,
        scriptPreview: scriptPreview(input.generatedMessage.body),
      },
    });

    return {
      status: "failed",
      ok: false,
      provider: "vonage",
      reason: "voice_request_failed",
      providerMessage,
      message,
    };
  }
}

async function sendTwilioVoiceCall(input: SendVoiceCallInput, to: string): Promise<VoiceCallResult> {
  if (!isTwilioConfigured()) {
    const message = `Voice call skipped for ${input.debtor.name}: Twilio is not configured.`;
    logVoiceSkipped(input, "twilio", "voice_not_configured", message, to);
    return { status: "skipped", ok: true, provider: "twilio", reason: "voice_not_configured", message };
  }

  const { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, TWILIO_PHONE_NUMBER: from } = process.env;
  if (!accountSid || !authToken || !from) {
    const message = `Voice call skipped for ${input.debtor.name}: Twilio is not configured.`;
    logVoiceSkipped(input, "twilio", "voice_not_configured", message, to);
    return { status: "skipped", ok: true, provider: "twilio", reason: "voice_not_configured", message };
  }

  const twiml = `<Response><Say>${escapeXml(input.generatedMessage.body)}</Say></Response>`;
  const requestBody = new URLSearchParams({
    To: to,
    From: from,
    Twiml: twiml,
  });

  const response = await (input.fetchImpl ?? fetch)(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: requestBody,
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    const message = `Voice call failed for ${input.debtor.name}: Twilio returned ${response.status}.`;
    logEvent({
      entityType: "debtor",
      entityId: input.debtor.id,
      eventType: "VOICE_CALL_FAILED",
      message,
      metadata: {
        provider: "twilio",
        providerStatus: response.status,
        providerMessage: payload.slice(0, 300),
        to,
        paymentReference: input.debtor.paymentReference,
        scriptPreview: scriptPreview(input.generatedMessage.body),
      },
    });

    return {
      status: "failed",
      ok: false,
      provider: "twilio",
      reason: "voice_request_failed",
      providerStatus: response.status,
      providerMessage: payload,
      message,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as { sid?: string };
  const message = `Twilio voice call started for ${input.debtor.name}.`;

  logEvent({
    entityType: "debtor",
    entityId: input.debtor.id,
    eventType: "VOICE_CALL_SENT",
    message,
    metadata: {
      provider: "twilio",
      providerCallId: payload.sid,
      to,
      paymentReference: input.debtor.paymentReference,
      scriptPreview: scriptPreview(input.generatedMessage.body),
    },
  });

  return {
    status: "sent",
    ok: true,
    provider: "twilio",
    to,
    providerCallId: payload.sid,
    message,
  };
}

export async function sendVoiceCall(input: SendVoiceCallInput): Promise<VoiceCallResult> {
  const provider = getVoiceProvider();
  const to = resolveDemoRecipient(input);
  const script = input.generatedMessage.body;

  logEvent({
    entityType: "debtor",
    entityId: input.debtor.id,
    eventType: "VOICE_CALL_ATTEMPTED",
    message: `Voice call considered for ${input.debtor.name}.`,
    metadata: {
      provider,
      to,
      paymentReference: input.debtor.paymentReference,
      messageSource: input.generatedMessage.source,
      scriptLength: script.length,
      scriptPreview: scriptPreview(script),
    },
  });

  const safety = validateMessageSafety(script, {
    debtor: input.debtor,
    expense: input.expense,
    escalationLevel: input.generatedMessage.escalationLevel,
    paymentLink: buildPublicDemoPaymentLink(input.debtor.paymentReference),
    policy: input.generatedMessage.policy,
    channel: "call_script",
  });

  if (!input.generatedMessage.safety.valid || !safety.valid || input.generatedMessage.channel !== "call_script") {
    const message = `Voice call skipped for ${input.debtor.name}: generated script failed safety validation.`;
    logVoiceSkipped(input, provider, "unsafe_script", message, to);
    return { status: "skipped", ok: true, provider, reason: "unsafe_script", message };
  }

  if (provider === "demo") {
    const message = `Voice call skipped for ${input.debtor.name}: VOICE_PROVIDER=demo.`;
    logVoiceSkipped(input, "demo", "voice_demo_provider", message, to);
    return { status: "skipped", ok: true, provider: "demo", reason: "voice_demo_provider", message };
  }

  if (provider === "unknown") {
    const message = `Voice call skipped for ${input.debtor.name}: unsupported VOICE_PROVIDER.`;
    logVoiceSkipped(input, provider, "unsupported_voice_provider", message, to);
    return { status: "skipped", ok: true, provider, reason: "unsupported_voice_provider", message };
  }

  if (countSentVoiceCallsForDebtor(input.debtor.id) >= DEMO_MAX_CALLS_PER_DEBTOR) {
    const message = `Voice call skipped for ${input.debtor.name}: demo call limit reached.`;
    logVoiceSkipped(input, provider, "demo_call_limit_reached", message, to);
    return { status: "skipped", ok: true, provider, reason: "demo_call_limit_reached", message };
  }

  if (!to || !isAllowedVoiceRecipient(to)) {
    const message = `Voice call skipped for ${input.debtor.name}: live calls are restricted to demo allowlist numbers.`;
    logVoiceSkipped(input, provider, "non_demo_recipient", message, to);
    return { status: "skipped", ok: true, provider, reason: "non_demo_recipient", message };
  }

  if (provider === "vonage") {
    return sendVonageVoiceCall(input, to);
  }

  if (provider === "twilio") {
    return sendTwilioVoiceCall(input, to);
  }

  const message = `Voice call skipped for ${input.debtor.name}: unsupported VOICE_PROVIDER.`;
  logVoiceSkipped(input, provider, "unsupported_voice_provider", message, to);
  return { status: "skipped", ok: true, provider, reason: "unsupported_voice_provider", message };
}
