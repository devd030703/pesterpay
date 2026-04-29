import { listEvents } from "./events";
import type { Debtor, DebtorState } from "./models";
import { getDebtor, listDebtors, saveDebtor, seedDemoDebtors } from "./store";
import { transitionDebtor } from "./stateMachine";

const coreDemoAdvance: Partial<Record<DebtorState, DebtorState>> = {
  created: "sms_1_sent",
  sms_1_sent: "sms_2_sent",
  sms_2_sent: "call_triggered",
  call_triggered: "payment_matched",
  payment_matched: "closed",
};

export type AgentTickInput = {
  debtorId?: string;
};

export type AgentTickResult =
  | {
      ok: true;
      debtor: Debtor;
      advanced: boolean;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export function agentTick(input: AgentTickInput = {}): AgentTickResult {
  if (listDebtors().length === 0) {
    seedDemoDebtors();
  }

  const debtor = input.debtorId
    ? getDebtor(input.debtorId)
    : listDebtors().find((candidate) => coreDemoAdvance[candidate.state]);

  if (!debtor) {
    return {
      ok: false,
      message: input.debtorId
        ? "Debtor not found."
        : "No debtor is ready for deterministic demo advancement.",
    };
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

