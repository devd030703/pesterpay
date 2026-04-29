import { logEvent } from "./events";
import type { Debtor, DebtorState, EventLogEntry, EventType } from "./models";

export const validDebtorTransitions: Record<DebtorState, DebtorState[]> = {
  created: ["sms_1_sent", "payment_matched", "paused", "disputed"],
  sms_1_sent: ["sms_2_sent", "payment_matched", "paused", "disputed"],
  sms_2_sent: ["call_triggered", "payment_matched", "paused", "disputed"],
  call_triggered: ["payment_matched", "paused", "disputed"],
  payment_matched: ["closed"],
  closed: [],
  paused: [],
  disputed: [],
};

const transitionEventTypes: Partial<Record<DebtorState, EventType>> = {
  sms_1_sent: "SMS_1_SENT",
  sms_2_sent: "SMS_2_SENT",
  call_triggered: "CALL_TRIGGERED",
  payment_matched: "PAYMENT_MATCHED",
  closed: "DEBT_CLOSED",
  paused: "DEBTOR_PAUSED",
  disputed: "DEBTOR_DISPUTED",
};

const transitionMessages: Partial<Record<DebtorState, string>> = {
  sms_1_sent: "First SMS reminder sent.",
  sms_2_sent: "Second SMS reminder sent.",
  call_triggered: "Demo call escalation triggered.",
  payment_matched: "Payment matched by deterministic demo matcher.",
  closed: "Debt closed after matched payment.",
  paused: "Debtor workflow paused.",
  disputed: "Debtor marked the debt as disputed.",
};

export type TransitionDebtorInput = {
  debtor: Debtor;
  to: DebtorState;
  reason?: string;
  metadata?: Record<string, unknown>;
};

export type TransitionResult =
  | {
      ok: true;
      debtor: Debtor;
      event: EventLogEntry;
    }
  | {
      ok: false;
      debtor: Debtor;
      error: string;
      event: EventLogEntry;
    };

export function canTransitionDebtor(from: DebtorState, to: DebtorState): boolean {
  return validDebtorTransitions[from].includes(to);
}

export function transitionDebtor(input: TransitionDebtorInput): TransitionResult {
  const { debtor, to, reason, metadata } = input;
  const from = debtor.state;

  if (!canTransitionDebtor(from, to)) {
    const error = `Invalid debtor transition: ${from} -> ${to}`;
    const event = logEvent({
      entityType: "debtor",
      entityId: debtor.id,
      eventType: "STATE_TRANSITION_REJECTED",
      message: error,
      metadata: {
        from,
        to,
        reason,
        ...metadata,
      },
    });

    return {
      ok: false,
      debtor,
      error,
      event,
    };
  }

  const nextDebtor: Debtor = {
    ...debtor,
    state: to,
    escalationLevel:
      to === "sms_1_sent" ? 1 : to === "sms_2_sent" ? 2 : to === "call_triggered" ? 3 : debtor.escalationLevel,
    updatedAt: new Date().toISOString(),
  };

  const eventType = transitionEventTypes[to];
  if (!eventType) {
    throw new Error(`Missing event type for debtor transition target: ${to}`);
  }

  const event = logEvent({
    entityType: "debtor",
    entityId: debtor.id,
    eventType,
    message: transitionMessages[to] ?? `Debtor transitioned to ${to}.`,
    metadata: {
      from,
      to,
      reason,
      ...metadata,
    },
  });

  return {
    ok: true,
    debtor: nextDebtor,
    event,
  };
}
