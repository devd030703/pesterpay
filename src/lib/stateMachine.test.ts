import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listEvents, resetEvents } from "./events";
import { agentTick } from "./agent";
import { createDebtor, resetDebtors } from "./store";
import { transitionDebtor } from "./stateMachine";

describe("debtor state machine", () => {
  it("rejects invalid transitions without mutating the debtor", () => {
    resetDebtors();
    resetEvents();

    const debtor = createDebtor({
      expenseId: "expense-1",
      name: "Sam",
      phone: "+447700900111",
      amountCents: 1200,
    });

    const result = transitionDebtor({
      debtor,
      to: "closed",
      reason: "test",
    });

    assert.equal(result.ok, false);
    assert.equal(result.debtor.state, "created");
    assert.equal(listEvents(debtor.id).at(-1)?.eventType, "STATE_TRANSITION_REJECTED");
  });

  it("advances a debtor through the deterministic demo lifecycle", () => {
    resetDebtors();
    resetEvents();

    const debtor = createDebtor({
      expenseId: "expense-1",
      name: "Sam",
      phone: "+447700900111",
      amountCents: 1200,
    });

    const states = [];
    for (let index = 0; index < 5; index += 1) {
      const result = agentTick({ debtorId: debtor.id });
      assert.equal(result.ok, true);
      if (result.ok) {
        states.push(result.debtor.state);
      }
    }

    assert.deepEqual(states, [
      "sms_1_sent",
      "sms_2_sent",
      "call_triggered",
      "payment_matched",
      "closed",
    ]);
    assert.deepEqual(
      listEvents(debtor.id).map((event) => event.eventType),
      [
        "DEBTOR_CREATED",
        "SMS_1_SENT",
        "PAYMENT_CHECK_NO_MATCH",
        "SMS_2_SENT",
        "PAYMENT_CHECK_NO_MATCH",
        "CALL_TRIGGERED",
        "PAYMENT_MATCHED",
        "DEBT_CLOSED",
      ],
    );
  });
});
