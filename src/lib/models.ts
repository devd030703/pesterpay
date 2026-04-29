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
