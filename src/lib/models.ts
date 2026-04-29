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

export const eventTypes = [
  "DEBTOR_CREATED",
  "SMS_1_SENT",
  "SMS_2_SENT",
  "CALL_TRIGGERED",
  "PAYMENT_CHECK_NO_MATCH",
  "PAYMENT_MATCHED",
  "DEBT_CLOSED",
  "DEBTOR_PAUSED",
  "DEBTOR_DISPUTED",
  "STATE_TRANSITION_REJECTED",
] as const;

export type EventType = (typeof eventTypes)[number];

export type EventLogEntry = {
  id: string;
  entityType: "debtor";
  entityId: string;
  eventType: EventType;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};
