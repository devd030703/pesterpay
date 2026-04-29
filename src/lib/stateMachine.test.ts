import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listEvents, resetEvents } from "./events";
import { agentTick } from "./agent";
import { createDebtor, listDebtors, listDemoPayments, listExpenses, resetDebtors, resetDemoPayments, resetExpenses, seedDemo } from "./store";
import { reconcileDemoPayment, submitDemoPayment } from "./payments";
import { transitionDebtor } from "./stateMachine";

describe("debtor state machine", () => {
  it("rejects invalid transitions without mutating the debtor", () => {
    resetDebtors();
    resetExpenses();
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

  it("advances a debtor through deterministic chase states without closing payment", () => {
    resetDebtors();
    resetExpenses();
    resetEvents();

    const debtor = createDebtor({
      expenseId: "expense-1",
      name: "Sam",
      phone: "+447700900111",
      amountCents: 1200,
    });

    const states = [];
    for (let index = 0; index < 4; index += 1) {
      const result = agentTick({ debtorId: debtor.id });
      assert.equal(result.ok, true);
      if (result.ok) {
        states.push(result.debtor?.state);
      }
    }

    assert.deepEqual(states, ["sms_1_sent", "sms_2_sent", "call_triggered", "call_triggered"]);
    assert.deepEqual(
      listEvents(debtor.id).map((event) => event.eventType),
      [
        "DEBTOR_CREATED",
        "SMS_1_SENT",
        "PAYMENT_CHECK_NO_MATCH",
        "SMS_2_SENT",
        "PAYMENT_CHECK_NO_MATCH",
        "CALL_TRIGGERED",
      ],
    );
  });
});

describe("seed demo", () => {
  it("creates exactly one expense and three debtors", () => {
    const { expense, debtors } = seedDemo();

    assert.equal(listExpenses().length, 1);
    assert.equal(listDebtors().length, 3);
    assert.equal(expense.title, "Dinner at Dishoom");
    assert.equal(expense.totalCents, 9600);
    assert.equal(debtors.length, 3);

    const names = debtors.map((d) => d.name).sort();
    assert.deepEqual(names, ["Hamza", "Lucia", "Sam"]);

    for (const debtor of debtors) {
      assert.equal(debtor.amountCents, 3200);
      assert.equal(debtor.expenseId, expense.id);
      assert.equal(debtor.state, "created");
    }
  });

  it("seeding twice produces exactly one expense and three debtors (no duplicates)", () => {
    seedDemo();
    seedDemo();

    assert.equal(listExpenses().length, 1);
    assert.equal(listDebtors().length, 3);
  });

  it("seeding after partial tick progress resets to clean state", () => {
    const { debtors: initialDebtors } = seedDemo();

    agentTick({ debtorId: initialDebtors[0].id });
    agentTick({ debtorId: initialDebtors[0].id });

    const { debtors: freshDebtors } = seedDemo();

    assert.equal(listDebtors().length, 3);
    assert.equal(listExpenses().length, 1);
    for (const debtor of freshDebtors) {
      assert.equal(debtor.state, "created");
    }
  });

  it("seeding resets the event log", () => {
    seedDemo();
    const eventsAfterFirstSeed = listEvents().length;
    assert.ok(eventsAfterFirstSeed > 0);

    seedDemo();
    const eventsAfterSecondSeed = listEvents().length;
    assert.equal(eventsAfterSecondSeed, eventsAfterFirstSeed);
  });

  it("canonical payment references are correct", () => {
    const { debtors } = seedDemo();
    const refs = new Set(debtors.map((d) => d.paymentReference));
    assert.ok(refs.has("SAM-DISH-32"));
    assert.ok(refs.has("LUCIA-DISH-32"));
    assert.ok(refs.has("HAMZA-DISH-32"));
  });
});

describe("reset demo", () => {
  it("clears all debtors, expenses, events, and payments", () => {
    seedDemo();
    assert.ok(listDebtors().length > 0);
    assert.ok(listExpenses().length > 0);
    assert.ok(listEvents().length > 0);

    resetDebtors();
    resetExpenses();
    resetDemoPayments();
    resetEvents();

    assert.equal(listDebtors().length, 0);
    assert.equal(listExpenses().length, 0);
    assert.equal(listEvents().length, 0);
    assert.equal(listDemoPayments().length, 0);
  });

  it("re-seeding after reset produces a clean canonical scenario", () => {
    seedDemo();
    resetDebtors();
    resetExpenses();
    resetEvents();

    const { expense, debtors } = seedDemo();
    assert.equal(listExpenses().length, 1);
    assert.equal(listDebtors().length, 3);
    assert.equal(expense.title, "Dinner at Dishoom");
    for (const debtor of debtors) {
      assert.equal(debtor.state, "created");
    }
  });
});

describe("agent tick reliability", () => {
  it("does not advance closed debtors", () => {
    resetDebtors();
    resetExpenses();
    resetEvents();

    const debtor = createDebtor({
      expenseId: "expense-closed",
      name: "Sam",
      phone: "+447700900111",
      amountCents: 3200,
    });

    const payment = submitDemoPayment({
      reference: debtor.paymentReference,
      amountCents: debtor.amountCents,
    });
    assert.equal(payment.ok, true);

    for (let i = 0; i < 2; i++) {
      agentTick({ debtorId: debtor.id });
    }

    const closedDebtor = listDebtors().find((d) => d.id === debtor.id);
    assert.equal(closedDebtor?.state, "closed");

    const eventCountBeforeExtraTick = listEvents(debtor.id).length;
    const result = agentTick({ debtorId: debtor.id });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.advanced, false);
    }
    assert.equal(listEvents(debtor.id).length, eventCountBeforeExtraTick);
  });

  it("returns ok: false when debtorId is specified but not found", () => {
    resetDebtors();
    resetExpenses();
    resetEvents();

    const result = agentTick({ debtorId: "non-existent-id" });
    assert.equal(result.ok, false);
  });

  it("returns ok: true with resolved message when all debtors are closed", () => {
    resetDebtors();
    resetExpenses();
    resetEvents();

    const debtor = createDebtor({
      expenseId: "expense-all-closed",
      name: "Sam",
      phone: "+447700900111",
      amountCents: 3200,
    });

    const payment = submitDemoPayment({
      reference: debtor.paymentReference,
      amountCents: debtor.amountCents,
    });
    assert.equal(payment.ok, true);

    const result = agentTick();
    assert.equal(result.ok, true);
    assert.ok(result.message.includes("resolved"));
  });

  it("tick advances exactly one debtor per call when multiple are advanceable", () => {
    const { debtors } = seedDemo();

    const stateBefore = debtors.map((d) => d.state);
    assert.deepEqual(stateBefore, ["created", "created", "created"]);

    agentTick();

    const stateAfter = listDebtors().map((d) => d.state);
    const advancedCount = stateAfter.filter((s) => s !== "created").length;
    assert.equal(advancedCount, 1);
  });
});

describe("payment reconciliation", () => {
  it("scores an exact incoming payment at 100 and closes the debtor", () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-32");
    assert.ok(sam);

    const result = submitDemoPayment({
      reference: "SAM-DISH-32",
      amountCents: 3200,
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.match.confidence, 100);
    assert.equal(result.match.outcome, "matched");
    assert.equal(result.debtor.state, "closed");
    assert.deepEqual(
      listEvents(result.debtor.id).map((event) => event.eventType).slice(-4),
      ["PAYMENT_SUBMITTED", "PAYMENT_CHECKED", "PAYMENT_MATCHED", "DEBT_CLOSED"],
    );
  });

  it("keeps a correct-reference wrong-amount payment open", () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-32");
    assert.ok(sam);

    const result = submitDemoPayment({
      reference: "SAM-DISH-32",
      amountCents: 1200,
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.match.confidence, 60);
    assert.equal(result.match.outcome, "partial_wrong_amount");
    assert.equal(result.debtor.state, "created");
    assert.equal(listEvents(result.debtor.id).at(-1)?.eventType, "PAYMENT_PARTIAL_WRONG_AMOUNT");
  });

  it("flags probable matches without closing", () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-32");
    assert.ok(sam);

    const match = reconcileDemoPayment(sam, {
      id: "payment-1",
      debtorId: sam.id,
      reference: "WRONG-REF",
      amountCents: 3200,
      currency: "GBP",
      direction: "incoming",
      createdAt: new Date().toISOString(),
    });

    assert.equal(match.confidence, 60);
    assert.equal(match.outcome, "probable_match");
  });

  it("wrong reference and wrong amount scores no_match", () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-32");
    assert.ok(sam);

    const match = reconcileDemoPayment(sam, {
      id: "payment-2",
      debtorId: sam.id,
      reference: "WRONG-REF",
      amountCents: 100,
      currency: "GBP",
      direction: "incoming",
      createdAt: new Date().toISOString(),
    });

    assert.equal(match.outcome, "no_match");
    assert.ok(match.confidence < 50);
  });

  it("outgoing exact payment does not close the debtor", () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-32");
    assert.ok(sam);

    const result = submitDemoPayment({
      reference: "SAM-DISH-32",
      amountCents: 3200,
      direction: "outgoing",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.notEqual(result.match.outcome, "matched");
    assert.notEqual(result.debtor.state, "closed");
  });

  it("second exact payment to a closed debtor does not double-close", () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-32");
    assert.ok(sam);

    const first = submitDemoPayment({ reference: "SAM-DISH-32", amountCents: 3200 });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.debtor.state, "closed");

    const eventCountAfterFirst = listEvents(sam.id).length;

    const second = submitDemoPayment({ reference: "SAM-DISH-32", amountCents: 3200 });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.debtor.state, "closed");
    assert.equal(listEvents(sam.id).length, eventCountAfterFirst + 2);
  });
});
