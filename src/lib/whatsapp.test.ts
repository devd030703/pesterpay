import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { listEvents, logEvent } from "./events";
import { generateTemplateMessage } from "./messageTemplates";
import type { Debtor, Expense } from "./models";
import { seedDemo } from "./store";
import { buildPublicDemoPaymentLink } from "./twilio";
import { sendDemoWhatsApp } from "./whatsapp";

function saveEnv(keys: string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function configureWhatsAppEnv() {
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
  process.env.DEMO_SAM_WHATSAPP_NUMBER = "whatsapp:+447449201211";
  process.env.TWILIO_WHATSAPP_STATUS_CALLBACK = "https://example.test/twilio/status";
  process.env.NEXT_PUBLIC_DEMO_BASE_URL = "http://localhost:3000";
}

function clearWhatsAppEnv() {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_WHATSAPP_FROM;
  delete process.env.DEMO_SAM_WHATSAPP_NUMBER;
  delete process.env.TWILIO_WHATSAPP_STATUS_CALLBACK;
  delete process.env.NEXT_PUBLIC_DEMO_BASE_URL;
}

function makeMessage(debtor: Debtor, expense: Expense) {
  return generateTemplateMessage({
    debtor,
    expense,
    escalationLevel: 1,
    paymentLink: buildPublicDemoPaymentLink(debtor.paymentReference),
    channel: "sms",
  });
}

describe("sendDemoWhatsApp", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveEnv([
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_WHATSAPP_FROM",
      "DEMO_SAM_WHATSAPP_NUMBER",
      "TWILIO_WHATSAPP_STATUS_CALLBACK",
      "NEXT_PUBLIC_DEMO_BASE_URL",
    ]);
    clearWhatsAppEnv();
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  it("skips gracefully and logs when Twilio WhatsApp is not configured", async () => {
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.name === "Dev");
    assert.ok(sam);

    const result = await sendDemoWhatsApp({
      debtor: sam,
      expense,
      generatedMessage: makeMessage(sam, expense),
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "twilio_whatsapp_not_configured");
    assert.deepEqual(
      listEvents(sam.id)
        .map((event) => event.eventType)
        .filter((eventType) => eventType.startsWith("TWILIO_WHATSAPP")),
      ["TWILIO_WHATSAPP_SEND_ATTEMPTED", "TWILIO_WHATSAPP_SKIPPED_NOT_CONFIGURED"],
    );
  });

  it("sends only to DEMO_SAM_WHATSAPP_NUMBER when configured", async () => {
    configureWhatsAppEnv();
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.name === "Dev");
    assert.ok(sam);

    let sentBody: URLSearchParams | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      sentBody = init?.body as URLSearchParams;
      return Response.json({ sid: "SMwhatsapp" });
    };

    const result = await sendDemoWhatsApp({
      debtor: sam,
      expense,
      generatedMessage: makeMessage(sam, expense),
      fetchImpl,
    });

    assert.equal(result.status, "sent");
    assert.equal(result.to, "whatsapp:+447449201211");
    assert.equal(sentBody?.get("To"), "whatsapp:+447449201211");
    assert.notEqual(sentBody?.get("To"), sam.phone);
    assert.equal(sentBody?.get("From"), "whatsapp:+14155238886");
    assert.equal(sentBody?.get("StatusCallback"), "https://example.test/twilio/status");
    assert.equal(listEvents(sam.id).some((event) => event.eventType === "TWILIO_WHATSAPP_SENT"), true);
  });

  it("skips non-Dev debtors without calling Twilio", async () => {
    configureWhatsAppEnv();
    const { expense, debtors } = seedDemo();
    const lucia = debtors.find((debtor) => debtor.name === "Lucia");
    assert.ok(lucia);
    let called = false;

    const result = await sendDemoWhatsApp({
      debtor: lucia,
      expense,
      generatedMessage: makeMessage(lucia, expense),
      fetchImpl: async () => {
        called = true;
        return Response.json({ sid: "SMwhatsapp" });
      },
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "non_demo_recipient");
    assert.equal(called, false);
    assert.equal(
      listEvents(lucia.id).some((event) => event.eventType === "TWILIO_WHATSAPP_SKIPPED_NON_DEMO_RECIPIENT"),
      true,
    );
  });

  it("respects the demo message limit per debtor", async () => {
    configureWhatsAppEnv();
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.name === "Dev");
    assert.ok(sam);
    let calls = 0;

    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return Response.json({ sid: `SMwhatsapp${calls}` });
    };

    const generatedMessage = makeMessage(sam, expense);
    await sendDemoWhatsApp({ debtor: sam, expense, generatedMessage, fetchImpl });
    await sendDemoWhatsApp({ debtor: sam, expense, generatedMessage, fetchImpl });
    await sendDemoWhatsApp({ debtor: sam, expense, generatedMessage, fetchImpl });
    const result = await sendDemoWhatsApp({ debtor: sam, expense, generatedMessage, fetchImpl });

    assert.equal(calls, 3);
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "demo_message_limit_reached");
    assert.equal(listEvents(sam.id).filter((event) => event.eventType === "TWILIO_WHATSAPP_SENT").length, 3);
    assert.equal(listEvents(sam.id).some((event) => event.eventType === "TWILIO_WHATSAPP_SKIPPED_DEMO_LIMIT"), true);
  });

  it("counts prior SMS sends against the WhatsApp demo message limit", async () => {
    configureWhatsAppEnv();
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.name === "Dev");
    assert.ok(sam);

    for (let index = 0; index < 3; index += 1) {
      logEvent({
        entityType: "debtor",
        entityId: sam.id,
        eventType: "TWILIO_SMS_SENT",
        message: `Prior SMS ${index + 1}`,
      });
    }

    let called = false;
    const result = await sendDemoWhatsApp({
      debtor: sam,
      expense,
      generatedMessage: makeMessage(sam, expense),
      fetchImpl: async () => {
        called = true;
        return Response.json({ sid: "SMwhatsapp" });
      },
    });

    assert.equal(called, false);
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "demo_message_limit_reached");
  });

  it("logs a failed event when Twilio rejects the WhatsApp request", async () => {
    configureWhatsAppEnv();
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.name === "Dev");
    assert.ok(sam);

    const result = await sendDemoWhatsApp({
      debtor: sam,
      expense,
      generatedMessage: makeMessage(sam, expense),
      fetchImpl: async () => new Response("bad credentials", { status: 401 }),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.providerStatus, 401);
    assert.equal(listEvents(sam.id).some((event) => event.eventType === "TWILIO_WHATSAPP_FAILED"), true);
  });
});
