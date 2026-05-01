import { logEvent } from "./events";
import type { Debtor, DemoPayment } from "./models";
import {
  fetchStarlingSettledTransactionsBetween,
  normalizeStarlingFeedItem,
  summarizeIncomingSettledFeedItems,
  type StarlingFeedItem,
} from "./starling";
import { createDemoPayment, getDebtorByPaymentReference, listDemoPayments, saveDebtor } from "./store";
import { transitionDebtor } from "./stateMachine";

export type PaymentMatchOutcome = "matched" | "probable_match" | "no_match" | "partial_wrong_amount";

export type PaymentMatchSignal = {
  label: string;
  points: number;
  matched: boolean;
  reason: string;
};

export type PaymentMatchResult = {
  confidence: number;
  outcome: PaymentMatchOutcome;
  reason: string;
  signals: PaymentMatchSignal[];
};

export type SubmitDemoPaymentInput = {
  reference: string;
  amountCents?: number;
  direction?: DemoPayment["direction"];
  source?: DemoPayment["source"];
  externalId?: string;
  createdAt?: string;
};

export type SubmitDemoPaymentResult =
  | {
      ok: true;
      debtor: Debtor;
      payment: DemoPayment;
      match: PaymentMatchResult;
    }
  | {
      ok: false;
      message: string;
    };

export type ReconcileStarlingSettledTransactionsInput = {
  minTransactionTimestamp?: string;
  maxTransactionTimestamp?: string;
  expectedAmountCents?: number;
  feedItems?: StarlingFeedItem[];
};

export type ReconcileStarlingSettledTransactionsResult = {
  ok: true;
  window: {
    minTransactionTimestamp: string;
    maxTransactionTimestamp: string;
  };
  expectedAmountCents: number;
  totalIncomingCents: number;
  totalMatchesExpected: boolean;
  incomingCount: number;
  matchedPayments: Array<{
    feedItemUid: string;
    reference: string;
    amountCents: number;
    debtorId: string;
    outcome: PaymentMatchOutcome;
    confidence: number;
  }>;
  unmatchedFeedItemUids: string[];
};

function formatPounds(cents: number): string {
  return `£${(cents / 100).toFixed(2)}`;
}

export function reconcileDemoPayment(debtor: Debtor, payment: DemoPayment): PaymentMatchResult {
  const exactAmount = payment.amountCents === debtor.amountCents;
  const exactReference = payment.reference.toUpperCase() === debtor.paymentReference.toUpperCase();
  const afterDebtCreated = new Date(payment.createdAt).getTime() >= new Date(debtor.createdAt).getTime();
  const incomingPayment = payment.direction === "incoming";

  const signals: PaymentMatchSignal[] = [
    {
      label: "Exact amount match",
      points: exactAmount ? 40 : 0,
      matched: exactAmount,
      reason: exactAmount
        ? `${formatPounds(payment.amountCents)} equals expected ${formatPounds(debtor.amountCents)}.`
        : `${formatPounds(payment.amountCents)} does not equal expected ${formatPounds(debtor.amountCents)}.`,
    },
    {
      label: "Exact reference match",
      points: exactReference ? 40 : 0,
      matched: exactReference,
      reason: exactReference
        ? `${payment.reference} matches ${debtor.paymentReference}.`
        : `${payment.reference} does not match ${debtor.paymentReference}.`,
    },
    {
      label: "Payment after request creation",
      points: afterDebtCreated ? 10 : 0,
      matched: afterDebtCreated,
      reason: afterDebtCreated ? "Payment timestamp is after debtor creation." : "Payment timestamp predates debtor creation.",
    },
    {
      label: "Incoming demo payment",
      points: incomingPayment ? 10 : 0,
      matched: incomingPayment,
      reason: incomingPayment ? "Payment direction is incoming." : "Payment direction is not incoming.",
    },
  ];

  const confidence = signals.reduce((sum, signal) => sum + signal.points, 0);

  if (exactReference && !exactAmount) {
    return {
      confidence,
      outcome: "partial_wrong_amount",
      reason: "Reference matched but amount was different, so the debt remains open.",
      signals,
    };
  }

  if (!incomingPayment && confidence >= 80) {
    return {
      confidence,
      outcome: "probable_match",
      reason: "High confidence but payment direction is outgoing. Manual review required.",
      signals,
    };
  }

  if (confidence >= 80) {
    return {
      confidence,
      outcome: "matched",
      reason: "High-confidence deterministic match. Debt can close.",
      signals,
    };
  }

  if (confidence >= 50) {
    return {
      confidence,
      outcome: "probable_match",
      reason: "Probable match requires manual review. Debt remains open.",
      signals,
    };
  }

  return {
    confidence,
    outcome: "no_match",
    reason: "Insufficient deterministic evidence. Debt remains open.",
    signals,
  };
}

export function submitDemoPayment(input: SubmitDemoPaymentInput): SubmitDemoPaymentResult {
  const debtor = getDebtorByPaymentReference(input.reference);

  if (!debtor) {
    return {
      ok: false,
      message: `No debtor found for payment reference ${input.reference}. Seed demo data first.`,
    };
  }

  const payment = createDemoPayment({
    debtorId: debtor.id,
    reference: input.reference,
    amountCents: input.amountCents ?? debtor.amountCents,
    currency: debtor.currency,
    direction: input.direction ?? "incoming",
    source: input.source ?? "demo",
    externalId: input.externalId,
    createdAt: input.createdAt,
  });

  logEvent({
    entityType: "debtor",
    entityId: debtor.id,
    eventType: "PAYMENT_SUBMITTED",
    message: `Demo payment submitted for ${debtor.paymentReference}: ${formatPounds(payment.amountCents)}.`,
    metadata: {
      paymentId: payment.id,
      reference: payment.reference,
      amountCents: payment.amountCents,
      direction: payment.direction,
    },
  });

  const match = reconcileDemoPayment(debtor, payment);

  logEvent({
    entityType: "debtor",
    entityId: debtor.id,
    eventType: "PAYMENT_CHECKED",
    message: `Payment checked for ${debtor.paymentReference}; confidence ${match.confidence}.`,
    metadata: {
      paymentId: payment.id,
      confidence: match.confidence,
      outcome: match.outcome,
      reason: match.reason,
    },
  });

  if (match.outcome === "partial_wrong_amount") {
    logEvent({
      entityType: "debtor",
      entityId: debtor.id,
      eventType: "PAYMENT_PARTIAL_WRONG_AMOUNT",
      message: `Payment reference matched for ${debtor.name}, but amount was ${formatPounds(payment.amountCents)} instead of ${formatPounds(debtor.amountCents)}.`,
      metadata: {
        paymentId: payment.id,
        confidence: match.confidence,
        expectedAmountCents: debtor.amountCents,
        receivedAmountCents: payment.amountCents,
      },
    });
  }

  if (match.outcome === "probable_match") {
    logEvent({
      entityType: "debtor",
      entityId: debtor.id,
      eventType: "PAYMENT_PROBABLE_MATCH",
      message: `Payment for ${debtor.name} flagged for manual review at confidence ${match.confidence}.`,
      metadata: {
        paymentId: payment.id,
        confidence: match.confidence,
      },
    });
  }

  if (match.outcome === "no_match") {
    logEvent({
      entityType: "debtor",
      entityId: debtor.id,
      eventType: "PAYMENT_CHECK_NO_MATCH",
      message: `Payment checked for ${debtor.paymentReference}; no deterministic match found.`,
      metadata: {
        paymentId: payment.id,
        confidence: match.confidence,
      },
    });
  }

  if (match.outcome !== "matched" || debtor.state === "closed" || debtor.state === "payment_matched") {
    return { ok: true, debtor, payment, match };
  }

  const matched = transitionDebtor({
    debtor,
    to: "payment_matched",
    reason: "payment_confidence_high",
    metadata: {
      paymentId: payment.id,
      confidence: match.confidence,
      outcome: match.outcome,
    },
  });

  if (!matched.ok) {
    return { ok: true, debtor, payment, match };
  }

  const savedMatched = saveDebtor(matched.debtor);
  const closed = transitionDebtor({
    debtor: savedMatched,
    to: "closed",
    reason: "payment_confidence_high",
    metadata: {
      paymentId: payment.id,
      confidence: match.confidence,
      outcome: match.outcome,
    },
  });

  if (!closed.ok) {
    return { ok: true, debtor: savedMatched, payment, match };
  }

  return { ok: true, debtor: saveDebtor(closed.debtor), payment, match };
}

function defaultStarlingWindow() {
  const max = new Date();
  const min = new Date(max.getTime() - 60 * 60 * 1000);

  return {
    minTransactionTimestamp: min.toISOString(),
    maxTransactionTimestamp: max.toISOString(),
  };
}

export async function reconcileStarlingSettledTransactions(
  input: ReconcileStarlingSettledTransactionsInput = {},
): Promise<ReconcileStarlingSettledTransactionsResult> {
  const defaults = defaultStarlingWindow();
  const window = {
    minTransactionTimestamp: input.minTransactionTimestamp ?? defaults.minTransactionTimestamp,
    maxTransactionTimestamp: input.maxTransactionTimestamp ?? defaults.maxTransactionTimestamp,
  };

  logEvent({
    entityType: "expense",
    entityId: "starling",
    eventType: "STARLING_POLL_STARTED",
    message: "Started read-only Starling settled transaction poll.",
    metadata: {
      minTransactionTimestamp: window.minTransactionTimestamp,
      maxTransactionTimestamp: window.maxTransactionTimestamp,
    },
  });

  let feedItems: StarlingFeedItem[];

  try {
    feedItems =
      input.feedItems ??
      (await fetchStarlingSettledTransactionsBetween({
        minTransactionTimestamp: window.minTransactionTimestamp,
        maxTransactionTimestamp: window.maxTransactionTimestamp,
      }));
  } catch (error) {
    logEvent({
      entityType: "expense",
      entityId: "starling",
      eventType: "STARLING_POLL_FAILED",
      message: "Starling settled transaction poll failed; demo remains usable.",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown Starling error",
      },
    });

    throw error;
  }

  const summary = summarizeIncomingSettledFeedItems(feedItems);
  const expectedAmountCents = input.expectedAmountCents ?? summary.totalIncomingCents;
  const matchedPayments: ReconcileStarlingSettledTransactionsResult["matchedPayments"] = [];
  const unmatchedFeedItemUids: string[] = [];

  for (const item of feedItems) {
    const candidate = normalizeStarlingFeedItem(item);

    if (!candidate) {
      unmatchedFeedItemUids.push(item.feedItemUid);
      continue;
    }

    const debtor = getDebtorByPaymentReference(candidate.reference);

    if (!debtor) {
      unmatchedFeedItemUids.push(item.feedItemUid);
      continue;
    }

    const alreadyRecorded = listDemoPayments().some((payment) => payment.externalId === item.feedItemUid);
    if (alreadyRecorded) {
      continue;
    }

    const result = submitDemoPayment({
      reference: debtor.paymentReference,
      amountCents: candidate.amountCents,
      direction: candidate.direction,
      source: "starling",
      externalId: item.feedItemUid,
      createdAt: candidate.createdAt,
    });

    if (!result.ok) {
      unmatchedFeedItemUids.push(item.feedItemUid);
      continue;
    }

    matchedPayments.push({
      feedItemUid: item.feedItemUid,
      reference: debtor.paymentReference,
      amountCents: candidate.amountCents,
      debtorId: debtor.id,
      outcome: result.match.outcome,
      confidence: result.match.confidence,
    });
  }

  const totalMatchesExpected = summary.totalIncomingCents === expectedAmountCents;

  logEvent({
    entityType: "expense",
    entityId: "starling",
    eventType: "STARLING_POLL_COMPLETED",
    message: `Starling poll found ${summary.incomingCount} incoming settled transaction(s), totaling ${formatPounds(summary.totalIncomingCents)}.`,
    metadata: {
      expectedAmountCents,
      totalIncomingCents: summary.totalIncomingCents,
      totalMatchesExpected,
      matchedPayments: matchedPayments.length,
      unmatchedFeedItems: unmatchedFeedItemUids.length,
    },
  });

  return {
    ok: true,
    window: {
      minTransactionTimestamp: window.minTransactionTimestamp,
      maxTransactionTimestamp: window.maxTransactionTimestamp,
    },
    expectedAmountCents,
    totalIncomingCents: summary.totalIncomingCents,
    totalMatchesExpected,
    incomingCount: summary.incomingCount,
    matchedPayments,
    unmatchedFeedItemUids,
  };
}
