import { listEvents, logEvent } from "./events";
import type { Debtor, DebtorState } from "./models";
import { getDebtor, listDebtors, saveDebtor } from "./store";
import { transitionDebtor } from "./stateMachine";

const coreDemoAdvance: Partial<Record<DebtorState, DebtorState>> = {
  created: "sms_1_sent",
  sms_1_sent: "sms_2_sent",
  sms_2_sent: "call_triggered",
};

export type AgentTickInput = {
  debtorId?: string;
};

export type AgentTickResult =
  | {
      ok: true;
      debtor?: Debtor;
      advanced?: boolean;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export function agentTick(input: AgentTickInput = {}): AgentTickResult {
  const debtors = listDebtors();

  if (debtors.length === 0) {
    return {
      ok: false,
      message: "No debtors found. Please seed demo data first.",
    };
  }

  const debtor = input.debtorId
    ? getDebtor(input.debtorId)
    : debtors.find((candidate) => coreDemoAdvance[candidate.state]);

  if (!debtor) {
    if (input.debtorId) {
      return { ok: false, message: `Debtor ${input.debtorId} not found.` };
    }
    return { ok: true, message: "All debts are successfully resolved." };
  }

  const to = coreDemoAdvance[debtor.state];
  if (!to) {
    return {
      ok: true,
      debtor,
      advanced: false,
      message: `Debtor is in terminal or side state: ${debtor.state}.`,
    };
  }

  if (debtor.state === "sms_1_sent" || debtor.state === "sms_2_sent") {
    logEvent({
      entityType: "debtor",
      entityId: debtor.id,
      eventType: "PAYMENT_CHECK_NO_MATCH",
      message: `Payment checked for ${debtor.paymentReference}; no matching transaction found.`,
      metadata: {
        reference: debtor.paymentReference,
        amountCents: debtor.amountCents,
        reason: "agent_tick",
      },
    });
  }

  const result = transitionDebtor({
    debtor,
    to,
    reason: "agent_tick",
    metadata: {
      actor: "deterministic_agent_tick",
      eventCountBeforeTick: listEvents(debtor.id).length,
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.error,
    };
  }

  saveDebtor(result.debtor);

  return {
    ok: true,
    debtor: result.debtor,
    advanced: true,
    message: `Advanced debtor ${debtor.id} from ${debtor.state} to ${to}.`,
  };
}
