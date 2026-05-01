import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { listEvents, resetEvents } from "./events";
import { generateTemplateMessage } from "./messageTemplates";
import { createDebtor, resetDebtors, resetExpenses } from "./store";
import { sendVoiceCall } from "./voice";

const originalEnv = {
  VOICE_PROVIDER: process.env.VOICE_PROVIDER,
  DEMO_SAM_PHONE_NUMBER: process.env.DEMO_SAM_PHONE_NUMBER,
  DEMO_DEV_PHONE_NUMBER: process.env.DEMO_DEV_PHONE_NUMBER,
  VONAGE_APPLICATION_ID: process.env.VONAGE_APPLICATION_ID,
  VONAGE_PRIVATE_KEY_PATH: process.env.VONAGE_PRIVATE_KEY_PATH,
  VONAGE_FROM_NUMBER: process.env.VONAGE_FROM_NUMBER,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createDevDebtor() {
  return createDebtor({
    expenseId: "expense-voice",
    name: "Dev",
    phone: "+447700900111",
    amountCents: 3200,
    paymentReference: "SAM-DISH-32",
  });
}

describe("sendVoiceCall", () => {
  afterEach(() => {
    restoreEnv();
    resetDebtors();
    resetExpenses();
    resetEvents();
  });

  it("supports VOICE_PROVIDER=demo without placing a live call", async () => {
    process.env.VOICE_PROVIDER = "demo";
    delete process.env.DEMO_SAM_PHONE_NUMBER;

    const debtor = createDevDebtor();
    const generatedMessage = generateTemplateMessage({ debtor, channel: "call_script", escalationLevel: 3 });

    const result = await sendVoiceCall({ debtor, generatedMessage });

    assert.equal(result.ok, true);
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "voice_demo_provider");
    assert.deepEqual(
      listEvents(debtor.id).map((event) => event.eventType).slice(-2),
      ["VOICE_CALL_ATTEMPTED", "VOICE_CALL_SKIPPED_DEMO_PROVIDER"],
    );
  });

  it("enforces the demo allowlist before a Vonage call", async () => {
    process.env.VOICE_PROVIDER = "vonage";
    process.env.DEMO_SAM_PHONE_NUMBER = "+447700900999";
    process.env.VONAGE_APPLICATION_ID = "app-id";
    process.env.VONAGE_PRIVATE_KEY_PATH = "./private.key";
    process.env.VONAGE_FROM_NUMBER = "12345678901";

    const debtor = createDevDebtor();
    const generatedMessage = generateTemplateMessage({ debtor, channel: "call_script", escalationLevel: 3 });

    const result = await sendVoiceCall({ debtor, generatedMessage, to: "+447700900111" });

    assert.equal(result.ok, true);
    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "non_demo_recipient");
    assert.equal(listEvents(debtor.id).at(-1)?.eventType, "VOICE_CALL_SKIPPED_NON_DEMO_RECIPIENT");
  });
});
