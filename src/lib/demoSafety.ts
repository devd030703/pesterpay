/** Maximum SMS/message reminders allowed per debtor in demo mode. */
export const DEMO_MAX_MESSAGES_PER_DEBTOR = 3;

/** Maximum voice calls allowed per debtor in demo mode. */
export const DEMO_MAX_CALLS_PER_DEBTOR = 1;

/** True when all Twilio credentials and the demo recipient number are set. */
export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER &&
      process.env.DEMO_SAM_PHONE_NUMBER,
  );
}

/** True when all Twilio WhatsApp Sandbox credentials and the opted-in demo recipient are set. */
export function isTwilioWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM &&
      process.env.DEMO_SAM_WHATSAPP_NUMBER,
  );
}

/** True when the Ollama base URL is set. */
export function isOllamaConfigured(): boolean {
  return Boolean(process.env.OLLAMA_BASE_URL);
}

/** True when Starling access token and account UID are set. */
export function isStarlingConfigured(): boolean {
  return Boolean(process.env.STARLING_ACCESS_TOKEN && process.env.STARLING_ACCOUNT_UID);
}
