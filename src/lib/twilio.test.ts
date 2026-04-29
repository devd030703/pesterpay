import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { listEvents } from "./events";
import { generateTemplateMessage } from "./messageTemplates";
import type { Debtor, Expense } from "./models";
import { seedDemo } from "./store";
import { buildPublicDemoPaymentLink, sendDemoSms } from "./twilio";

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

function configureTwilioEnv() {
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.TWILIO_PHONE_NUMBER = "+441234567890";
  process.env.DEMO_SAM_PHONE_NUMBER = "+447700900999";
  process.env.NEXT_PUBLIC_DEMO_BASE_URL = "http://localhost:3000";
}

function clearTwilioEnv() {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_PHONE_NUMBER;
  delete process.env.DEMO_SAM_PHONE_NUMBER;
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

describe("sendDemoSms", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveEnv([
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
      "DEMO_SAM_PHONE_NUMBER",
      "NEXT_PUBLIC_DEMO_BASE_URL",
    ]);
    clearTwilioEnv();
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  it("skips gracefully and logs when Twilio is not configured", async () => {
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.name === "Sam");
    assert.ok(sam);

    const result = await sendDemoSms({
      debtor: sam,
      expense,
      generatedMessage: makeMessage(sam, expense),
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "twilio_not_configured");
    assert.deepEqual(
      listEvents(sam.id).map((event) => event.eventType).filter((eventType) => eventType.startsWith("TWILIO_SMS")),
      ["TWILIO_SMS_SEND_ATTEMPTED", "TWILIO_SMS_SKIPPED_NOT_CONFIGURED"],
    );
  });

  it("sends only to DEMO_SAM_PHONE_NUMBER when configured", async () => {
    configureTwilioEnv();
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.name === "Sam");
    assert.ok(sam);

    let sentBody: URLSearchParams | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      sentBody = init?.body as URLSearchParams;
      return Response.json({ sid: "SMtest" });
    };

    const result = await sendDemoSms({
      debtor: sam,
      expense,
      generatedMessage: makeMessage(sam, expense),
      fetchImpl,
    });

    assert.equal(result.status, "sent");
    assert.equal(result.to, "+447700900999");
    assert.equal(sentBody?.get("To"), "+447700900999");
    assert.notEqual(sentBody?.get("To"), sam.phone);
    assert.equal(sentBody?.get("From"), "+441234567890");
    assert.equal(listEvents(sam.id).some((event) => event.eventType === "TWILIO_SMS_SENT"), true);
  });

  it("skips non-Sam debtors without calling Twilio", async () => {
    configureTwilioEnv();
    const { expense, debtors } = seedDemo();
    const lucia = debtors.find((debtor) => debtor.name === "Lucia");
    assert.ok(lucia);
    let called = false;

    const result = await sendDemoSms({
      debtor: lucia,
      expense,
      generatedMessage: makeMessage(lucia, expense),
      fetchImpl: async () => {
        called = true;
        return Response.json({ sid: "SMtest" });
      },
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "non_demo_recipient");
    assert.equal(called, false);
    assert.equal(listEvents(lucia.id).some((event) => event.eventType === "TWILIO_SMS_SKIPPED_NON_DEMO_RECIPIENT"), true);
  });

  it("respects the demo SMS limit per debtor", async () => {
    configureTwilioEnv();
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.name === "Sam");
    assert.ok(sam);
    let calls = 0;

    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return Response.json({ sid: `SMtest${calls}` });
    };

    const generatedMessage = makeMessage(sam, expense);
    await sendDemoSms({ debtor: sam, expense, generatedMessage, fetchImpl });
    await sendDemoSms({ debtor: sam, expense, generatedMessage, fetchImpl });
    await sendDemoSms({ debtor: sam, expense, generatedMessage, fetchImpl });
    const result = await sendDemoSms({ debtor: sam, expense, generatedMessage, fetchImpl });

    assert.equal(calls, 3);
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "demo_message_limit_reached");
    assert.equal(listEvents(sam.id).filter((event) => event.eventType === "TWILIO_SMS_SENT").length, 3);
    assert.equal(listEvents(sam.id).some((event) => event.eventType === "TWILIO_SMS_SKIPPED_DEMO_LIMIT"), true);
  });

  it("logs a failed event when Twilio rejects the request", async () => {
    configureTwilioEnv();
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.name === "Sam");
    assert.ok(sam);

    const result = await sendDemoSms({
      debtor: sam,
      expense,
      generatedMessage: makeMessage(sam, expense),
      fetchImpl: async () => new Response("bad credentials", { status: 401 }),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.providerStatus, 401);
    assert.equal(listEvents(sam.id).some((event) => event.eventType === "TWILIO_SMS_FAILED"), true);
  });
});
