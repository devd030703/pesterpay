import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  DEMO_MAX_MESSAGES_PER_DEBTOR,
  DEMO_MAX_CALLS_PER_DEBTOR,
  isTwilioConfigured,
  isTwilioWhatsAppConfigured,
  isOllamaConfigured,
  isStarlingConfigured,
} from "./demoSafety";

describe("demo safety constants", () => {
  it("max messages per debtor is 3", () => {
    assert.equal(DEMO_MAX_MESSAGES_PER_DEBTOR, 3);
  });

  it("max calls per debtor is 1", () => {
    assert.equal(DEMO_MAX_CALLS_PER_DEBTOR, 1);
  });
});

describe("isTwilioConfigured", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
      TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
      DEMO_SAM_PHONE_NUMBER: process.env.DEMO_SAM_PHONE_NUMBER,
    };
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;
    delete process.env.DEMO_SAM_PHONE_NUMBER;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("returns false when all Twilio vars are missing", () => {
    assert.equal(isTwilioConfigured(), false);
  });

  it("returns false when only some Twilio vars are set", () => {
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    assert.equal(isTwilioConfigured(), false);
  });

  it("returns true when all Twilio vars are set", () => {
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_PHONE_NUMBER = "+441234567890";
    process.env.DEMO_SAM_PHONE_NUMBER = "+447700900111";
    assert.equal(isTwilioConfigured(), true);
  });
});

describe("isTwilioWhatsAppConfigured", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
      TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
      DEMO_SAM_WHATSAPP_NUMBER: process.env.DEMO_SAM_WHATSAPP_NUMBER,
    };
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_WHATSAPP_FROM;
    delete process.env.DEMO_SAM_WHATSAPP_NUMBER;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("returns false when WhatsApp vars are missing", () => {
    assert.equal(isTwilioWhatsAppConfigured(), false);
  });

  it("returns false when only some WhatsApp vars are set", () => {
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
    assert.equal(isTwilioWhatsAppConfigured(), false);
  });

  it("returns true when all WhatsApp vars are set", () => {
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
    process.env.DEMO_SAM_WHATSAPP_NUMBER = "whatsapp:+447449201211";
    assert.equal(isTwilioWhatsAppConfigured(), true);
  });
});

describe("isOllamaConfigured", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_BASE_URL;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.OLLAMA_BASE_URL;
    } else {
      process.env.OLLAMA_BASE_URL = saved;
    }
  });

  it("returns false when OLLAMA_BASE_URL is missing", () => {
    assert.equal(isOllamaConfigured(), false);
  });

  it("returns true when OLLAMA_BASE_URL is set", () => {
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    assert.equal(isOllamaConfigured(), true);
  });
});

describe("isStarlingConfigured", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      STARLING_ACCESS_TOKEN: process.env.STARLING_ACCESS_TOKEN,
      STARLING_ACCOUNT_UID: process.env.STARLING_ACCOUNT_UID,
    };
    delete process.env.STARLING_ACCESS_TOKEN;
    delete process.env.STARLING_ACCOUNT_UID;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("returns false when Starling vars are missing", () => {
    assert.equal(isStarlingConfigured(), false);
  });

  it("returns true when both Starling vars are set", () => {
    process.env.STARLING_ACCESS_TOKEN = "token";
    process.env.STARLING_ACCOUNT_UID = "uid";
    assert.equal(isStarlingConfigured(), true);
  });
});
