import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listEvents, resetEvents } from "./events";
import { agentTick } from "./agent";
import { generateTemplateMessage, validateMessageSafety } from "./messageTemplates";
import { generateAgentMessage } from "./ollama";
import { createDebtor, listDebtors, listDemoPayments, listExpenses, resetDebtors, resetDemoPayments, resetExpenses, seedDemo } from "./store";
import { reconcileDemoPayment, reconcileStarlingSettledTransactions, submitDemoPayment } from "./payments";
import { transitionDebtor } from "./stateMachine";

describe("debtor state machine", () => {
  it("rejects invalid transitions without mutating the debtor", () => {
    resetDebtors();
    resetExpenses();
    resetEvents();

    const debtor = createDebtor({
      expenseId: "expense-1",
      name: "Dev",
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

  it("advances a debtor through deterministic chase states without closing payment", async () => {
    resetDebtors();
    resetExpenses();
    resetEvents();

    const debtor = createDebtor({
      expenseId: "expense-1",
      name: "Dev",
      phone: "+447700900111",
      amountCents: 1200,
    });

    const states = [];
    for (let index = 0; index < 4; index += 1) {
      const result = await agentTick({ debtorId: debtor.id });
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
        "MESSAGE_GENERATED",
        "TWILIO_SMS_SEND_ATTEMPTED",
        "TWILIO_SMS_SKIPPED_NON_DEMO_RECIPIENT",
        "TWILIO_WHATSAPP_SEND_ATTEMPTED",
        "TWILIO_WHATSAPP_SKIPPED_NON_DEMO_RECIPIENT",
        "SMS_1_SENT",
        "PAYMENT_CHECK_NO_MATCH",
        "MESSAGE_GENERATED",
        "TWILIO_SMS_SEND_ATTEMPTED",
        "TWILIO_SMS_SKIPPED_NON_DEMO_RECIPIENT",
        "TWILIO_WHATSAPP_SEND_ATTEMPTED",
        "TWILIO_WHATSAPP_SKIPPED_NON_DEMO_RECIPIENT",
        "SMS_2_SENT",
        "PAYMENT_CHECK_NO_MATCH",
        "MESSAGE_GENERATED",
        "VOICE_CALL_ATTEMPTED",
        "VOICE_CALL_SKIPPED_DEMO_PROVIDER",
        "CALL_TRIGGERED",
      ],
    );
  });

  it("checks Starling repayments on tick and turns matched debtor green by closing them", async () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((candidate) => candidate.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const result = await agentTick({
      starlingFeedItems: [
        {
          feedItemUid: "feed-sam-agent-cycle",
          amount: {
            currency: "GBP",
            minorUnits: 500,
          },
          direction: "IN",
          reference: "SAM-DISH-2",
          settlementTime: new Date().toISOString(),
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(listDebtors().find((debtor) => debtor.id === sam.id)?.state, "closed");
    assert.equal(result.ok ? result.starling?.matchedPayments[0]?.reference : undefined, "SAM-DISH-2");
    assert.ok(listEvents(sam.id).some((event) => event.eventType === "PAYMENT_MATCHED"));
    assert.ok(listEvents(sam.id).some((event) => event.eventType === "DEBT_CLOSED"));
  });
});

describe("message generation", () => {
  it("template fallback includes required payment details and stays SMS length", () => {
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const message = generateTemplateMessage({
      debtor: sam,
      expense,
      policy: "unhinged_goblin",
      paymentLink: "/pay/SAM-DISH-2",
      escalationLevel: 1,
    });

    assert.equal(message.source, "template");
    assert.equal(message.safety.valid, true);
    assert.ok(message.body.length <= 280);
    assert.match(message.body, /Dev/);
    assert.match(message.body, /£5/);
    assert.match(message.body, /Dinner at Dishoom/);
    assert.match(message.body, /SAM-DISH-2/);
    assert.match(message.body, /\/pay\/SAM-DISH-2/);
  });

  it("rejects unsafe generated copy that impersonates regulated collections", () => {
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const safety = validateMessageSafety(
      "I am a debt collector bank. Pay £5 for Dinner at Dishoom with ref SAM-DISH-2 at /pay/SAM-DISH-2.",
      {
        debtor: sam,
        expense,
        paymentLink: "/pay/SAM-DISH-2",
      },
    );

    assert.equal(safety.valid, false);
    assert.ok(safety.reasons.some((reason) => reason.includes("unsafe")));
  });

  it("falls back to templates when Ollama is unavailable", async () => {
    const { expense, debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const message = await generateAgentMessage(
      {
        debtor: sam,
        expense,
        paymentLink: "/pay/SAM-DISH-2",
        policy: "polite_british",
      },
      {
        ollamaUrl: "http://127.0.0.1:9",
        timeoutMs: 25,
      },
    );

    assert.equal(message.source, "template_fallback");
    assert.equal(message.safety.valid, true);
    assert.match(message.body, /£5/);
    assert.match(message.body, /Dinner at Dishoom/);
    assert.match(message.body, /SAM-DISH-2/);
  });

  it("agent tick logs generated copy before deterministic state transition", async () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const result = await agentTick({ debtorId: sam.id, policy: "corporate_collections" });
    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.generatedMessage?.includes("SAM-DISH-2") : false, true);

    const events = listEvents(sam.id);
    const generatedIndex = events.findIndex((event) => event.eventType === "MESSAGE_GENERATED");
    const transitionIndex = events.findIndex((event) => event.eventType === "SMS_1_SENT");
    assert.ok(generatedIndex > -1);
    assert.ok(transitionIndex > generatedIndex);
    assert.equal(events[generatedIndex].eventType, "MESSAGE_GENERATED");
    assert.equal(events.at(-1)?.eventType, "SMS_1_SENT");
    assert.equal(events[generatedIndex].metadata?.policy, "corporate_collections");
  });
});

describe("seed demo", () => {
  it("creates exactly one expense and three debtors", () => {
    const { expense, debtors } = seedDemo();

    assert.equal(listExpenses().length, 1);
    assert.equal(listDebtors().length, 3);
    assert.equal(expense.title, "Dinner at Dishoom");
    assert.equal(expense.totalCents, 700);
    assert.equal(debtors.length, 3);

    const names = debtors.map((d) => d.name).sort();
    assert.deepEqual(names, ["Dev", "Hamza", "Lucia"]);

    const expectedAmounts = new Map([
      ["Dev", 500],
      ["Lucia", 100],
      ["Hamza", 100],
    ]);

    for (const debtor of debtors) {
      assert.equal(debtor.amountCents, expectedAmounts.get(debtor.name));
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

  it("can seed the demo with custom repayment amounts", () => {
    const { expense, debtors } = seedDemo({
      amountsCents: {
        Dev: 750,
        Lucia: 1250,
        Hamza: 250,
      },
    });

    assert.equal(expense.totalCents, 2250);
    assert.equal(debtors.find((debtor) => debtor.name === "Dev")?.amountCents, 750);
    assert.equal(debtors.find((debtor) => debtor.name === "Lucia")?.amountCents, 1250);
    assert.equal(debtors.find((debtor) => debtor.name === "Hamza")?.amountCents, 250);
  });

  it("seeding after partial tick progress resets to clean state", async () => {
    const { debtors: initialDebtors } = seedDemo();

    await agentTick({ debtorId: initialDebtors[0].id });
    await agentTick({ debtorId: initialDebtors[0].id });

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
    assert.ok(refs.has("SAM-DISH-2"));
    assert.ok(refs.has("LUCIA-DISH-1"));
    assert.ok(refs.has("HAMZA-DISH-1"));
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

describe("Starling reconciliation", () => {
  it("sums incoming settled feed items in the last-hour response and closes exact reference matches", async () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const result = await reconcileStarlingSettledTransactions({
      expectedAmountCents: 500,
      minTransactionTimestamp: "2026-04-30T10:00:00.000Z",
      maxTransactionTimestamp: "2026-04-30T11:00:00.000Z",
      feedItems: [
        {
          feedItemUid: "feed-sam-1",
          amount: {
            currency: "GBP",
            minorUnits: 500,
          },
          direction: "IN",
          reference: "SAM-DISH-2",
          settlementTime: "2026-04-30T10:20:00.000Z",
        },
      ],
    });

    assert.equal(result.totalIncomingCents, 500);
    assert.equal(result.totalMatchesExpected, true);
    assert.equal(result.matchedPayments.length, 1);
    assert.equal(result.matchedPayments[0].outcome, "matched");
    assert.equal(listDebtors().find((debtor) => debtor.id === sam.id)?.state, "closed");
    assert.equal(listEvents().at(-1)?.eventType, "STARLING_POLL_COMPLETED");
  });

  it("reports total mismatch without closing a wrong-amount reference match", async () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const result = await reconcileStarlingSettledTransactions({
      expectedAmountCents: 500,
      feedItems: [
        {
          feedItemUid: "feed-sam-short",
          amount: {
            currency: "GBP",
            minorUnits: 1200,
          },
          direction: "IN",
          reference: "SAM-DISH-2",
          settlementTime: new Date().toISOString(),
        },
      ],
    });

    assert.equal(result.totalIncomingCents, 1200);
    assert.equal(result.totalMatchesExpected, false);
    assert.equal(result.matchedPayments[0].outcome, "partial_wrong_amount");
    assert.equal(listDebtors().find((debtor) => debtor.id === sam.id)?.state, "created");
  });
});

describe("agent tick reliability", () => {
  it("does not advance closed debtors", async () => {
    resetDebtors();
    resetExpenses();
    resetEvents();

    const debtor = createDebtor({
      expenseId: "expense-closed",
      name: "Dev",
      phone: "+447700900111",
      amountCents: 500,
    });

    const payment = submitDemoPayment({
      reference: debtor.paymentReference,
      amountCents: debtor.amountCents,
    });
    assert.equal(payment.ok, true);

    for (let i = 0; i < 2; i++) {
      await agentTick({ debtorId: debtor.id });
    }

    const closedDebtor = listDebtors().find((d) => d.id === debtor.id);
    assert.equal(closedDebtor?.state, "closed");

    const eventCountBeforeExtraTick = listEvents(debtor.id).length;
    const result = await agentTick({ debtorId: debtor.id });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.advanced, false);
    }
    assert.equal(listEvents(debtor.id).length, eventCountBeforeExtraTick);
  });

  it("returns ok: false when debtorId is specified but not found", async () => {
    resetDebtors();
    resetExpenses();
    resetEvents();

    const result = await agentTick({ debtorId: "non-existent-id" });
    assert.equal(result.ok, false);
  });

  it("returns ok: true with resolved message when all debtors are closed", async () => {
    resetDebtors();
    resetExpenses();
    resetEvents();

    const debtor = createDebtor({
      expenseId: "expense-all-closed",
      name: "Dev",
      phone: "+447700900111",
      amountCents: 500,
    });

    const payment = submitDemoPayment({
      reference: debtor.paymentReference,
      amountCents: debtor.amountCents,
    });
    assert.equal(payment.ok, true);

    const result = await agentTick();
    assert.equal(result.ok, true);
    assert.ok(result.message.includes("resolved"));
  });

  it("tick advances exactly one debtor per call when multiple are advanceable", async () => {
    const { debtors } = seedDemo();

    const stateBefore = debtors.map((d) => d.state);
    assert.deepEqual(stateBefore, ["created", "created", "created"]);

    await agentTick();

    const stateAfter = listDebtors().map((d) => d.state);
    const advancedCount = stateAfter.filter((s) => s !== "created").length;
    assert.equal(advancedCount, 1);
  });
});

describe("payment reconciliation", () => {
  it("scores an exact incoming payment at 100 and closes the debtor", () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const result = submitDemoPayment({
      reference: "SAM-DISH-2",
      amountCents: 500,
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
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const result = submitDemoPayment({
      reference: "SAM-DISH-2",
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
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const match = reconcileDemoPayment(sam, {
      id: "payment-1",
      debtorId: sam.id,
      reference: "WRONG-REF",
      amountCents: 500,
      currency: "GBP",
      direction: "incoming",
      createdAt: new Date().toISOString(),
    });

    assert.equal(match.confidence, 60);
    assert.equal(match.outcome, "probable_match");
  });

  it("wrong reference and wrong amount scores no_match", () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const match = reconcileDemoPayment(sam, {
      id: "payment-2",
      debtorId: sam.id,
      reference: "WRONG-REF",
      amountCents: 250,
      currency: "GBP",
      direction: "incoming",
      createdAt: new Date().toISOString(),
    });

    assert.equal(match.outcome, "no_match");
    assert.ok(match.confidence < 50);
  });

  it("outgoing exact payment does not close the debtor", () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const result = submitDemoPayment({
      reference: "SAM-DISH-2",
      amountCents: 500,
      direction: "outgoing",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.notEqual(result.match.outcome, "matched");
    assert.notEqual(result.debtor.state, "closed");
  });

  it("second exact payment to a closed debtor does not double-close", () => {
    const { debtors } = seedDemo();
    const sam = debtors.find((debtor) => debtor.paymentReference === "SAM-DISH-2");
    assert.ok(sam);

    const first = submitDemoPayment({ reference: "SAM-DISH-2", amountCents: 500 });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.debtor.state, "closed");

    const eventCountAfterFirst = listEvents(sam.id).length;

    const second = submitDemoPayment({ reference: "SAM-DISH-2", amountCents: 500 });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.debtor.state, "closed");
    assert.equal(listEvents(sam.id).length, eventCountAfterFirst + 2);
  });
});
