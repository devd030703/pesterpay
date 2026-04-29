"use client";

import { useMemo, useState } from "react";
import type { Debtor, DemoPayment, EventLogEntry } from "@/lib/models";
import type { PaymentMatchResult } from "@/lib/payments";

type PaymentFormProps = {
  debtor: Debtor;
  expenseTitle: string;
};

type PaymentResponse = {
  ok: boolean;
  message?: string;
  debtor?: Debtor;
  payment?: DemoPayment;
  match?: PaymentMatchResult;
  events?: EventLogEntry[];
};

function formatMoney(cents: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function outcomeLabel(outcome?: PaymentMatchResult["outcome"]) {
  const labels: Record<PaymentMatchResult["outcome"], string> = {
    matched: "Matched and closed",
    probable_match: "Manual review",
    no_match: "No match",
    partial_wrong_amount: "Wrong amount",
  };

  return outcome ? labels[outcome] : "Awaiting payment";
}

export function PaymentForm({ debtor, expenseTitle }: PaymentFormProps) {
  const [amount, setAmount] = useState((debtor.amountCents / 100).toFixed(2));
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("Ready to submit demo incoming payment.");
  const [result, setResult] = useState<PaymentResponse | null>(null);

  const currentDebtor = result?.debtor ?? debtor;
  const debtorEvents = useMemo(
    () => (result?.events ?? []).filter((event) => event.entityId === currentDebtor.id).slice(-6).reverse(),
    [currentDebtor.id, result?.events],
  );
  const amountCents = Math.round(Number(amount) * 100);

  async function submitPayment() {
    setSubmitting(true);
    setNotice("Submitting demo payment...");

    try {
      const response = await fetch("/api/payments/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: debtor.paymentReference,
          amountCents,
        }),
      });
      const payload = (await response.json()) as PaymentResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message ?? "Demo payment failed.");
      }

      setResult(payload);
      setNotice(payload.match?.reason ?? "Payment checked.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Demo payment failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      <section className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--pp-border)] pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--pp-lime)]">Demo payment page</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{currentDebtor.name}</h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--pp-text-muted)]">
              Mark a local demo payment as received. Matching is deterministic and closes only when confidence is high enough.
            </p>
          </div>
          <div className="border border-[var(--pp-border-strong)] px-3 py-2 text-xs font-bold uppercase tracking-widest text-[var(--pp-lime)]">
            {currentDebtor.state}
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="border border-[var(--pp-border)] p-3">
            <dt className="text-[10px] font-bold uppercase text-[var(--pp-text-dim)]">Expense</dt>
            <dd className="mt-1 text-lg font-bold">{expenseTitle}</dd>
          </div>
          <div className="border border-[var(--pp-border)] p-3">
            <dt className="text-[10px] font-bold uppercase text-[var(--pp-text-dim)]">Amount owed</dt>
            <dd className="mt-1 text-lg font-bold">{formatMoney(currentDebtor.amountCents, currentDebtor.currency)}</dd>
          </div>
          <div className="border border-[var(--pp-border)] p-3">
            <dt className="text-[10px] font-bold uppercase text-[var(--pp-text-dim)]">Payment reference</dt>
            <dd className="mt-1 break-all text-lg font-bold text-[var(--pp-lime)]">{currentDebtor.paymentReference}</dd>
          </div>
          <div className="border border-[var(--pp-border)] p-3">
            <dt className="text-[10px] font-bold uppercase text-[var(--pp-text-dim)]">Current status</dt>
            <dd className="mt-1 text-lg font-bold">{currentDebtor.state}</dd>
          </div>
        </dl>

        <div className="mt-5 border border-[var(--pp-border-strong)] bg-[var(--pp-bg-soft)] p-4">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--pp-text-dim)]" htmlFor="amount">
            Received amount
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              className="min-h-12 flex-1 border border-[var(--pp-border-strong)] bg-black px-3 font-mono text-lg font-bold text-[var(--pp-text)] outline-none focus:border-[var(--pp-lime)]"
              id="amount"
              inputMode="decimal"
              min="0"
              onChange={(event) => setAmount(event.target.value)}
              step="0.01"
              type="number"
              value={amount}
            />
            <button
              className="min-h-12 border border-[var(--pp-green)] px-4 text-sm font-bold uppercase tracking-widest text-[var(--pp-green)] hover:bg-[var(--pp-green)] hover:text-black disabled:cursor-wait disabled:opacity-50"
              disabled={submitting || !Number.isFinite(amountCents) || amountCents <= 0}
              onClick={submitPayment}
              type="button"
            >
              Mark as paid
            </button>
          </div>
          <p className="mt-3 text-xs font-bold text-[var(--pp-text-muted)]">{notice}</p>
        </div>
      </section>

      <aside className="grid gap-4">
        <section className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Payment confidence</h2>
              <p className="mt-1 text-sm text-[var(--pp-text-muted)]">{outcomeLabel(result?.match?.outcome)}</p>
            </div>
            <p className="text-3xl font-bold text-[var(--pp-green)]">{result?.match?.confidence ?? 0}</p>
          </div>

          <div className="mt-5 space-y-2">
            {(result?.match?.signals ?? []).map((signal) => (
              <div className="border border-[var(--pp-border)] p-3" key={signal.label}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase text-[var(--pp-text)]">{signal.label}</p>
                  <p className={signal.matched ? "text-sm font-bold text-[var(--pp-green)]" : "text-sm font-bold text-[var(--pp-red)]"}>
                    {signal.points}
                  </p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[var(--pp-text-muted)]">{signal.reason}</p>
              </div>
            ))}
            {!result?.match ? (
              <div className="border border-dashed border-[var(--pp-border-strong)] p-5 text-sm text-[var(--pp-text-muted)]">
                Submit a demo payment to calculate confidence.
              </div>
            ) : null}
          </div>
        </section>

        <section className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-5">
          <h2 className="text-lg font-bold">Recent payment events</h2>
          <div className="mt-4 space-y-2">
            {debtorEvents.length > 0 ? (
              debtorEvents.map((event) => (
                <article className="border-l-2 border-[var(--pp-border-strong)] bg-[var(--pp-bg-soft)] py-2 pl-3" key={event.id}>
                  <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase text-[var(--pp-text-dim)]">
                    <span>{event.eventType}</span>
                    <span>{formatTime(event.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--pp-text)]">{event.message}</p>
                </article>
              ))
            ) : (
              <div className="border border-dashed border-[var(--pp-border-strong)] p-5 text-sm text-[var(--pp-text-muted)]">
                No payment events in this browser session yet.
              </div>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
