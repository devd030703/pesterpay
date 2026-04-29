"use client";

import { useEffect, useMemo, useState } from "react";
import type { Debtor, DebtorState, EventLogEntry } from "@/lib/models";

type DemoState = {
  debtors: Debtor[];
  events: EventLogEntry[];
};

type DemoAction = "seed" | "reset" | "tick";

const expense = {
  title: "Dinner at Dishoom",
  totalCents: 9600,
  paidBy: "Dev",
};

const stateLabels: Record<DebtorState, string> = {
  created: "Created",
  sms_1_sent: "SMS 1 sent",
  sms_2_sent: "SMS 2 sent",
  call_triggered: "Call triggered",
  payment_matched: "Payment matched",
  closed: "Closed",
  paused: "Paused",
  disputed: "Disputed",
};

function formatMoney(cents: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatTime(value?: string) {
  if (!value) {
    return "Not contacted";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function stateTone(state: DebtorState) {
  if (state === "payment_matched" || state === "closed") {
    return "border-[var(--pp-green)] text-[var(--pp-green)]";
  }

  if (state === "disputed") {
    return "border-[var(--pp-red)] text-[var(--pp-red)]";
  }

  if (state === "call_triggered") {
    return "border-[var(--pp-lime)] text-[var(--pp-lime)]";
  }

  if (state === "sms_1_sent" || state === "sms_2_sent" || state === "paused") {
    return "border-[var(--pp-amber)] text-[var(--pp-amber)]";
  }

  return "border-[var(--pp-border-strong)] text-[var(--pp-text)]";
}

function nextActionLabel(state: DebtorState) {
  const nextActions: Record<DebtorState, string> = {
    created: "Send first SMS",
    sms_1_sent: "Check payment, then send SMS 2",
    sms_2_sent: "Check payment, then trigger call",
    call_triggered: "Match demo payment",
    payment_matched: "Close debt",
    closed: "Stop chasing",
    paused: "Paused",
    disputed: "Needs manual review",
  };

  return nextActions[state];
}

function getLastContacted(debtor: Debtor, events: EventLogEntry[]) {
  return events
    .filter(
      (event) =>
        event.entityId === debtor.id &&
        ["SMS_1_SENT", "SMS_2_SENT", "CALL_TRIGGERED"].includes(event.eventType),
    )
    .at(-1)?.createdAt;
}

function metadataRows(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null);
}

export default function Home() {
  const [demoState, setDemoState] = useState<DemoState>({ debtors: [], events: [] });
  const [runningAction, setRunningAction] = useState<DemoAction | null>(null);
  const [notice, setNotice] = useState("Dashboard loaded. Seed demo data to start.");

  const sortedEvents = useMemo(
    () =>
      [...demoState.events].sort(
        (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
    [demoState.events],
  );

  const currentExpenseActive = demoState.debtors.length > 0;
  const closedCount = demoState.debtors.filter((debtor) => debtor.state === "closed").length;
  const paidCount = demoState.debtors.filter(
    (debtor) => debtor.state === "payment_matched" || debtor.state === "closed",
  ).length;
  const activeDebtCents = demoState.debtors
    .filter((debtor) => debtor.state !== "closed")
    .reduce((sum, debtor) => sum + debtor.amountCents, 0);
  const overallStatus =
    demoState.debtors.length === 0
      ? "No demo loaded"
      : closedCount === demoState.debtors.length
        ? "Closed"
        : paidCount > 0
          ? "Reconciling"
          : "Collecting";
  const latestEvent = sortedEvents.at(-1);

  async function runAction(action: DemoAction) {
    setRunningAction(action);
    setNotice("Running demo action...");

    try {
      const endpoint =
        action === "seed" ? "/api/demo/seed" : action === "reset" ? "/api/demo/reset" : "/api/agent/tick";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "tick" ? JSON.stringify({}) : undefined,
      });
      const payload = (await response.json()) as DemoState & { ok?: boolean; message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Demo action failed.");
      }

      setDemoState({
        debtors: payload.debtors ?? [],
        events: payload.events ?? [],
      });
      setNotice(
        action === "seed"
          ? "Seeded Dinner at Dishoom."
          : action === "reset"
            ? "Demo state reset."
            : payload.message ?? "Agent tick complete.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Demo action failed.");
    } finally {
      setRunningAction(null);
    }
  }

  useEffect(() => {
    let active = true;

    fetch("/api/demo/state", { cache: "no-store" })
      .then((response) => response.json())
      .then((nextState: DemoState) => {
        if (active) {
          setDemoState(nextState);
        }
      })
      .catch(() => {
        if (active) {
          setNotice("Dashboard loaded. Seed demo data to start.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[var(--pp-bg)] px-6 py-6 font-mono text-[var(--pp-text)]">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[320px_1fr]">
        <section className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-4">
          <div className="mb-5">
            <p className="text-xs uppercase text-[var(--pp-text-dim)]">PesterPay</p>
            <h1 className="mt-2 text-2xl font-semibold">Debt operations console</h1>
          </div>

          <div className="space-y-2">
            <button
              className="w-full border border-[var(--pp-lime)] px-3 py-3 text-left text-sm text-[var(--pp-lime)] hover:bg-[var(--pp-lime)] hover:text-black disabled:cursor-wait disabled:opacity-50"
              disabled={runningAction !== null}
              onClick={() => runAction("seed")}
            >
              Seed Demo Data
            </button>
            <button
              className="w-full border border-[var(--pp-border-strong)] px-3 py-3 text-left text-sm hover:border-[var(--pp-text)] disabled:cursor-wait disabled:opacity-50"
              disabled={runningAction !== null}
              onClick={() => runAction("tick")}
            >
              Run Agent Tick
            </button>
            <button
              className="w-full border border-[var(--pp-red)] px-3 py-3 text-left text-sm text-[var(--pp-red)] hover:bg-[var(--pp-red)] hover:text-black disabled:cursor-wait disabled:opacity-50"
              disabled={runningAction !== null}
              onClick={() => runAction("reset")}
            >
              Reset Demo
            </button>
          </div>

          <div className="mt-5 border border-[var(--pp-border)] p-3 text-sm text-[var(--pp-text-muted)]">
            {notice}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
            <div className="border border-[var(--pp-border)] p-3">
              <p className="text-[var(--pp-text-dim)]">Active debt</p>
              <p className="mt-2 text-xl text-[var(--pp-amber)]">{formatMoney(activeDebtCents)}</p>
            </div>
            <div className="border border-[var(--pp-border)] p-3">
              <p className="text-[var(--pp-text-dim)]">Debtors</p>
              <p className="mt-2 text-xl">{demoState.debtors.length}</p>
            </div>
            <div className="border border-[var(--pp-border)] p-3">
              <p className="text-[var(--pp-text-dim)]">Paid</p>
              <p className="mt-2 text-xl text-[var(--pp-green)]">{paidCount}</p>
            </div>
            <div className="border border-[var(--pp-border)] p-3">
              <p className="text-[var(--pp-text-dim)]">Events</p>
              <p className="mt-2 text-xl">{sortedEvents.length}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase text-[var(--pp-text-dim)]">Expense summary</p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {currentExpenseActive ? expense.title : "No expense loaded"}
                </h2>
                <p className="mt-2 text-sm text-[var(--pp-text-muted)]">
                  {currentExpenseActive
                    ? `Paid by ${expense.paidBy}. Split across ${demoState.debtors.length} debtors.`
                    : "Seed the demo to create Dinner at Dishoom."}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="min-w-28 border border-[var(--pp-border)] p-3">
                  <p className="text-[var(--pp-text-dim)]">Total</p>
                  <p className="mt-1 text-lg">{currentExpenseActive ? formatMoney(expense.totalCents) : "--"}</p>
                </div>
                <div className="min-w-28 border border-[var(--pp-border)] p-3">
                  <p className="text-[var(--pp-text-dim)]">Debtors</p>
                  <p className="mt-1 text-lg">{demoState.debtors.length}</p>
                </div>
                <div className="min-w-28 border border-[var(--pp-border)] p-3">
                  <p className="text-[var(--pp-text-dim)]">Status</p>
                  <p className="mt-1 text-lg text-[var(--pp-lime)]">{overallStatus}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <section className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Debtor cards</h2>
                <p className="text-xs uppercase text-[var(--pp-text-dim)]">Deterministic state machine</p>
              </div>

              {demoState.debtors.length === 0 ? (
                <div className="border border-dashed border-[var(--pp-border-strong)] p-6 text-sm text-[var(--pp-text-muted)]">
                  No debtors yet. Seed demo data to create Sam, Lucia, and Hamza.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {demoState.debtors.map((debtor) => (
                    <article key={debtor.id} className={`border p-4 ${stateTone(debtor.state)}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-semibold text-[var(--pp-text)]">{debtor.name}</h3>
                          <p className="mt-1 text-sm text-[var(--pp-text-muted)]">
                            Owes {formatMoney(debtor.amountCents, debtor.currency)}
                          </p>
                        </div>
                        <span className={`border px-2 py-1 text-xs ${stateTone(debtor.state)}`}>
                          {stateLabels[debtor.state]}
                        </span>
                      </div>

                      <dl className="mt-5 grid gap-3 text-sm text-[var(--pp-text-muted)]">
                        <div className="flex justify-between gap-3 border-t border-[var(--pp-border)] pt-3">
                          <dt>Payment reference</dt>
                          <dd className="text-right text-[var(--pp-text)]">{debtor.paymentReference}</dd>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-[var(--pp-border)] pt-3">
                          <dt>Escalation level</dt>
                          <dd className="text-right text-[var(--pp-text)]">{debtor.escalationLevel}</dd>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-[var(--pp-border)] pt-3">
                          <dt>Last contacted</dt>
                          <dd className="text-right text-[var(--pp-text)]">
                            {formatTime(getLastContacted(debtor, sortedEvents))}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-[var(--pp-border)] pt-3">
                          <dt>Next action</dt>
                          <dd className="text-right text-[var(--pp-lime)]">{nextActionLabel(debtor.state)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-4">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Event timeline</h2>
                <p className="mt-1 text-sm text-[var(--pp-text-muted)]">
                  {latestEvent ? latestEvent.message : "No events recorded yet."}
                </p>
              </div>

              <div className="max-h-[640px] space-y-3 overflow-auto pr-1">
                {sortedEvents.length === 0 ? (
                  <div className="border border-dashed border-[var(--pp-border-strong)] p-6 text-sm text-[var(--pp-text-muted)]">
                    The audit trail will show debtor creation, agent actions, payment checks, and state transitions.
                  </div>
                ) : (
                  sortedEvents.map((event) => {
                    const debtor = demoState.debtors.find((candidate) => candidate.id === event.entityId);

                    return (
                      <article key={event.id} className="border-l border-[var(--pp-border-strong)] pl-3">
                        <div className="border border-[var(--pp-border)] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-[var(--pp-text-dim)]">{formatTime(event.createdAt)}</p>
                            <p className="border border-[var(--pp-border-strong)] px-2 py-1 text-xs text-[var(--pp-lime)]">
                              {event.eventType}
                            </p>
                          </div>
                          <p className="mt-3 text-sm">{event.message}</p>
                          <p className="mt-2 text-xs text-[var(--pp-text-muted)]">
                            Entity: {debtor?.name ?? event.entityId}
                          </p>
                          {metadataRows(event.metadata).length > 0 ? (
                            <dl className="mt-3 grid gap-1 border-t border-[var(--pp-border)] pt-3 text-xs text-[var(--pp-text-muted)]">
                              {metadataRows(event.metadata).map(([key, value]) => (
                                <div className="flex justify-between gap-3" key={key}>
                                  <dt>{key}</dt>
                                  <dd className="max-w-44 truncate text-right text-[var(--pp-text)]">
                                    {String(value)}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
