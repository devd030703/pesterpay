export type Expense = {
  id: string;
  title: string;
  totalCents: number;
  currency: "GBP" | "USD";
  paidBy: string;
  createdAt: string;
};

export const debtorStates = [
  "created",
  "sms_1_sent",
  "sms_2_sent",
  "call_triggered",
  "payment_matched",
  "closed",
  "paused",
  "disputed",
] as const;

export type DebtorState = (typeof debtorStates)[number];

export type Debtor = {
  id: string;
  expenseId: string;
  name: string;
  phone: string;
  amountCents: number;
  currency: "GBP" | "USD";
  paymentReference: string;
  escalationLevel: number;
  state: DebtorState;
  createdAt: string;
  updatedAt: string;
};

export type DemoPayment = {
  id: string;
  debtorId: string;
  reference: string;
  amountCents: number;
  currency: "GBP" | "USD";
  direction: "incoming" | "outgoing";
  createdAt: string;
};

export const eventTypes = [
  "EXPENSE_CREATED",
  "DEBTOR_CREATED",
  "MESSAGE_GENERATED",
  "TWILIO_SMS_SEND_ATTEMPTED",
  "TWILIO_SMS_SENT",
  "TWILIO_SMS_FAILED",
  "TWILIO_SMS_SKIPPED_NOT_CONFIGURED",
  "TWILIO_SMS_SKIPPED_DEMO_LIMIT",
  "TWILIO_SMS_SKIPPED_NON_DEMO_RECIPIENT",
  "TWILIO_SMS_SKIPPED_UNSAFE_MESSAGE",
  "TWILIO_WHATSAPP_SEND_ATTEMPTED",
  "TWILIO_WHATSAPP_SENT",
  "TWILIO_WHATSAPP_FAILED",
  "TWILIO_WHATSAPP_SKIPPED_NOT_CONFIGURED",
  "TWILIO_WHATSAPP_SKIPPED_DEMO_LIMIT",
  "TWILIO_WHATSAPP_SKIPPED_NON_DEMO_RECIPIENT",
  "TWILIO_WHATSAPP_SKIPPED_UNSAFE_MESSAGE",
  "SMS_1_SENT",
  "SMS_2_SENT",
  "CALL_TRIGGERED",
  "PAYMENT_SUBMITTED",
  "PAYMENT_CHECKED",
  "PAYMENT_CHECK_NO_MATCH",
  "PAYMENT_PARTIAL_WRONG_AMOUNT",
  "PAYMENT_PROBABLE_MATCH",
  "PAYMENT_MATCHED",
  "DEBT_CLOSED",
  "DEBTOR_PAUSED",
  "DEBTOR_DISPUTED",
  "STATE_TRANSITION_REJECTED",
] as const;

export type EventType = (typeof eventTypes)[number];

export type EventLogEntry = {
  id: string;
  entityType: "expense" | "debtor";
  entityId: string;
  eventType: EventType;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};
