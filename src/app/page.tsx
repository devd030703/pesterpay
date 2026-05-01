"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Debtor, DebtorState, DemoPayment, EventLogEntry } from "@/lib/models";
import { NarratorPanel } from "@/components/NarratorPanel";

type DemoState = {
  debtors: Debtor[];
  payments: DemoPayment[];
  events: EventLogEntry[];
};

type DemoAction = "start" | "reset";

const defaultExpense = {
  title: "Dinner at Dishoom",
  totalCents: 700,
  paidBy: "Dev",
};

type AmountInputs = {
  Dev: string;
  Lucia: string;
  Hamza: string;
};

const stateLabels: Record<DebtorState, string> = {
  created: "INITIALIZED",
  sms_1_sent: "SMS_SENT_L1",
  sms_2_sent: "SMS_SENT_L2",
  call_triggered: "VOX_CALL_L3",
  payment_matched: "RECONCILED",
  closed: "RECOVERED",
  paused: "PAUSED",
  disputed: "DISPUTED",
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
    created: "Queue SMS escalation (Level 1)",
    sms_1_sent: "Verify payment -> Queue SMS escalation (Level 2)",
    sms_2_sent: "Verify payment -> Queue Voice escalation (Level 3)",
    call_triggered: "Await automated payment reconciliation",
    payment_matched: "Perform final audit and close recovery case",
    closed: "Recovery successful. Monitoring inactive.",
    paused: "Recovery halted by system administrator.",
    disputed: "Manual intervention required: Debt disputed.",
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

function getPaidBackCents(debtor: Debtor, payments: DemoPayment[]) {
  return payments
    .filter((payment) => payment.debtorId === debtor.id && payment.direction === "incoming")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
}

function metadataRows(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null);
}

function eventStatusInfo(type: EventLogEntry["eventType"]) {
  const map: Record<EventLogEntry["eventType"], { color: string; label: string }> = {
    EXPENSE_CREATED: { color: "text-[var(--pp-text-muted)]", label: "SYS:EXPENSE" },
    DEBTOR_CREATED: { color: "text-[var(--pp-text-muted)]", label: "SYS:CREATED" },
    MESSAGE_GENERATED: { color: "text-[var(--pp-lime)]", label: "MSG:GENERATED" },
    TWILIO_SMS_SEND_ATTEMPTED: { color: "text-[var(--pp-text-muted)]", label: "SMS:CHECK" },
    TWILIO_SMS_SENT: { color: "text-[var(--pp-green)]", label: "SMS:SENT" },
    TWILIO_SMS_FAILED: { color: "text-[var(--pp-red)]", label: "SMS:FAILED" },
    TWILIO_SMS_SKIPPED_NOT_CONFIGURED: { color: "text-[var(--pp-text-dim)]", label: "SMS:NO_CONFIG" },
    TWILIO_SMS_SKIPPED_DEMO_LIMIT: { color: "text-[var(--pp-amber)]", label: "SMS:LIMIT" },
    TWILIO_SMS_SKIPPED_NON_DEMO_RECIPIENT: { color: "text-[var(--pp-amber)]", label: "SMS:DEMO_ONLY" },
    TWILIO_SMS_SKIPPED_UNSAFE_MESSAGE: { color: "text-[var(--pp-red)]", label: "SMS:UNSAFE" },
    TWILIO_WHATSAPP_SEND_ATTEMPTED: { color: "text-[var(--pp-text-muted)]", label: "WA:CHECK" },
    TWILIO_WHATSAPP_SENT: { color: "text-[var(--pp-green)]", label: "WA:SENT" },
    TWILIO_WHATSAPP_FAILED: { color: "text-[var(--pp-red)]", label: "WA:FAILED" },
    TWILIO_WHATSAPP_SKIPPED_NOT_CONFIGURED: { color: "text-[var(--pp-text-dim)]", label: "WA:NO_CONFIG" },
    TWILIO_WHATSAPP_SKIPPED_DEMO_LIMIT: { color: "text-[var(--pp-amber)]", label: "WA:LIMIT" },
    TWILIO_WHATSAPP_SKIPPED_NON_DEMO_RECIPIENT: { color: "text-[var(--pp-amber)]", label: "WA:DEMO_ONLY" },
    TWILIO_WHATSAPP_SKIPPED_UNSAFE_MESSAGE: { color: "text-[var(--pp-red)]", label: "WA:UNSAFE" },
    VOICE_CALL_ATTEMPTED: { color: "text-[var(--pp-text-muted)]", label: "VOX:CHECK" },
    VOICE_CALL_SENT: { color: "text-[var(--pp-green)]", label: "VOX:SENT" },
    VOICE_CALL_FAILED: { color: "text-[var(--pp-red)]", label: "VOX:FAILED" },
    VOICE_CALL_SKIPPED_NOT_CONFIGURED: { color: "text-[var(--pp-text-dim)]", label: "VOX:NO_CONFIG" },
    VOICE_CALL_SKIPPED_DEMO_PROVIDER: { color: "text-[var(--pp-text-dim)]", label: "VOX:DEMO" },
    VOICE_CALL_SKIPPED_DEMO_LIMIT: { color: "text-[var(--pp-amber)]", label: "VOX:LIMIT" },
    VOICE_CALL_SKIPPED_NON_DEMO_RECIPIENT: { color: "text-[var(--pp-amber)]", label: "VOX:ALLOWLIST" },
    VOICE_CALL_SKIPPED_UNSAFE_SCRIPT: { color: "text-[var(--pp-red)]", label: "VOX:UNSAFE" },
    VOICE_CALL_SKIPPED_UNSUPPORTED_PROVIDER: { color: "text-[var(--pp-amber)]", label: "VOX:PROVIDER" },
    SMS_1_SENT: { color: "text-[var(--pp-amber)]", label: "MSG:SMS_L1" },
    SMS_2_SENT: { color: "text-[var(--pp-amber)]", label: "MSG:SMS_L2" },
    CALL_TRIGGERED: { color: "text-[var(--pp-lime)]", label: "VOX:CALL_L3" },
    PAYMENT_SUBMITTED: { color: "text-[var(--pp-lime)]", label: "FIN:SUBMIT" },
    PAYMENT_CHECKED: { color: "text-[var(--pp-lime)]", label: "FIN:CHECK" },
    PAYMENT_CHECK_NO_MATCH: { color: "text-[var(--pp-text-dim)]", label: "FIN:NO_PAY" },
    PAYMENT_PARTIAL_WRONG_AMOUNT: { color: "text-[var(--pp-amber)]", label: "FIN:AMOUNT" },
    PAYMENT_PROBABLE_MATCH: { color: "text-[var(--pp-amber)]", label: "FIN:REVIEW" },
    STARLING_POLL_STARTED: { color: "text-[var(--pp-text-muted)]", label: "BANK:POLL" },
    STARLING_POLL_FAILED: { color: "text-[var(--pp-red)]", label: "BANK:FAILED" },
    STARLING_POLL_COMPLETED: { color: "text-[var(--pp-lime)]", label: "BANK:SETTLED" },
    PAYMENT_MATCHED: { color: "text-[var(--pp-green)]", label: "FIN:MATCHED" },
    DEBT_CLOSED: { color: "text-[var(--pp-green)]", label: "SYS:CLOSED" },
    DEBTOR_PAUSED: { color: "text-[var(--pp-text-dim)]", label: "SYS:PAUSED" },
    DEBTOR_DISPUTED: { color: "text-[var(--pp-red)]", label: "SYS:DISPUTE" },
    STATE_TRANSITION_REJECTED: { color: "text-[var(--pp-red)]", label: "SYS:REJECT" },
  };

  return map[type] ?? { color: "text-[var(--pp-text)]", label: "EVENT" };
}

export default function Home() {
  const [demoState, setDemoState] = useState<DemoState>({ debtors: [], payments: [], events: [] });
  const [runningAction, setRunningAction] = useState<DemoAction | null>(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [amountModalOpen, setAmountModalOpen] = useState(false);
  const [amountInputs, setAmountInputs] = useState<AmountInputs>({ Dev: "5.00", Lucia: "1.00", Hamza: "1.00" });
  const [notice, setNotice] = useState("Dashboard loaded. Enter amounts to start.");
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const expectedTotalCents = currentExpenseActive
    ? demoState.debtors.reduce((sum, debtor) => sum + debtor.amountCents, 0)
    : defaultExpense.totalCents;
  const recoveryProgressPercent =
    expectedTotalCents > 0 ? Math.round(((expectedTotalCents - activeDebtCents) / expectedTotalCents) * 100) : 0;
  const overallStatus =
    demoState.debtors.length === 0
      ? "No demo loaded"
      : closedCount === demoState.debtors.length
        ? "Closed"
        : paidCount > 0
          ? "Reconciling"
          : "Collecting";
  const latestEvent = sortedEvents.at(-1);

  const stopDemoTimer = useCallback(() => {
    if (cycleTimerRef.current) {
      clearInterval(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
    setDemoRunning(false);
  }, []);

  const applyDemoPayload = useCallback((payload: DemoState) => {
    setDemoState({
      debtors: payload.debtors ?? [],
      payments: payload.payments ?? [],
      events: payload.events ?? [],
    });
  }, []);

  const runAgentCycle = useCallback(async () => {
    const response = await fetch("/api/agent/tick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const payload = (await response.json()) as DemoState & { ok?: boolean; advanced?: boolean; message?: string };

    if (!response.ok) {
      throw new Error(payload.message ?? "Agent cycle failed.");
    }

    applyDemoPayload(payload);

    const canAdvance = (payload.debtors ?? []).some((debtor) =>
      ["created", "sms_1_sent", "sms_2_sent"].includes(debtor.state),
    );

    if (!payload.advanced && !canAdvance) {
      stopDemoTimer();
      setNotice(payload.message ?? "Demo automation complete.");
      return;
    }

    setNotice(payload.message ?? "Agent cycle complete.");
  }, [applyDemoPayload, stopDemoTimer]);

  function parseAmountInput(value: string) {
    if (value.trim() === "") {
      return undefined;
    }

    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      return undefined;
    }
    return Math.round(amount * 100);
  }

  function buildAmountPayload() {
    const dev = parseAmountInput(amountInputs.Dev);
    const lucia = parseAmountInput(amountInputs.Lucia);
    const hamza = parseAmountInput(amountInputs.Hamza);

    if (dev === undefined || lucia === undefined || hamza === undefined) {
      return undefined;
    }

    return {
      Dev: dev,
      Lucia: lucia,
      Hamza: hamza,
    };
  }

  async function runAction(action: DemoAction) {
    setRunningAction(action);
    setNotice("Running demo action...");

    try {
      if (action === "reset") {
        stopDemoTimer();
      }

      const endpoint = action === "start" ? "/api/demo/seed" : "/api/demo/reset";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:
          action === "start"
            ? JSON.stringify({
                amountsCents: buildAmountPayload(),
              })
            : undefined,
      });
      const payload = (await response.json()) as DemoState & { ok?: boolean; message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Demo action failed.");
      }

      applyDemoPayload(payload);

      if (action === "start") {
        if (cycleTimerRef.current) {
          clearInterval(cycleTimerRef.current);
        }
        setDemoRunning(true);
        setAmountModalOpen(false);
        setNotice("Demo started. Agent cycles run every 5 seconds.");
        let isRunning = false;
        cycleTimerRef.current = setInterval(() => {
          if (isRunning) return;
          isRunning = true;
          runAgentCycle()
            .catch((error) => {
              stopDemoTimer();
              setNotice(error instanceof Error ? error.message : "Agent cycle failed.");
            })
            .finally(() => {
              isRunning = false;
            });
        }, 5000);
      } else {
        setNotice("Demo state reset.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Demo action failed.");
    } finally {
      setRunningAction(null);
    }
  }

  function handleStartDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!buildAmountPayload()) {
      setNotice("Enter valid repayment amounts for Dev, Lucia, and Hamza.");
      return;
    }

    void runAction("start");
  }

  useEffect(() => {
    let active = true;

    fetch("/api/demo/state", { cache: "no-store" })
      .then((response) => response.json())
      .then((nextState: DemoState) => {
        if (active) {
          applyDemoPayload(nextState);
        }
      })
      .catch(() => {
        if (active) {
          setNotice("Dashboard loaded. Enter amounts to start.");
        }
      });

    return () => {
      active = false;
    };
  }, [applyDemoPayload]);

  useEffect(() => stopDemoTimer, [stopDemoTimer]);

  return (
    <main className="min-h-screen bg-[var(--pp-bg)] px-6 py-6 font-mono text-[var(--pp-text)]">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[320px_1fr]">
        <section className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-4">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--pp-lime)]">Autonomous Agent</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">PesterPay Console</h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--pp-text-muted)]">
              Recovery agent for social debt. Autonomously monitors, escalates, and reconciles payments through persistent multi-channel pestering.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <button
                className="w-full border border-[var(--pp-lime)] px-3 py-3 text-left text-sm font-bold text-[var(--pp-lime)] hover:bg-[var(--pp-lime)] hover:text-black disabled:cursor-wait disabled:opacity-50"
                disabled={runningAction !== null}
                onClick={() => setAmountModalOpen(true)}
              >
                [1] Enter Amounts
              </button>
              <p className="mt-1 px-1 text-[10px] leading-tight text-[var(--pp-text-dim)] uppercase">
                Set the amount each person needs to pay back, then start automation
              </p>
            </div>

            <div>
              <button
                className="w-full border border-[var(--pp-red)] px-3 py-3 text-left text-sm font-bold text-[var(--pp-red)] hover:bg-[var(--pp-red)] hover:text-black disabled:cursor-wait disabled:opacity-50"
                disabled={runningAction !== null}
                onClick={() => runAction("reset")}
              >
                [R] Reset Engine
              </button>
              <p className="mt-1 px-1 text-[10px] leading-tight text-[var(--pp-text-dim)] uppercase">
                Wipe all state and return to standby
              </p>
            </div>
          </div>

          <div className="mt-5 border-2 border-[var(--pp-lime)] bg-[var(--pp-bg-soft)] p-4 shadow-[0_0_15px_rgba(198,255,74,0.1)]">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--pp-lime)]" />
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--pp-lime)]">System Monitor</div>
            </div>
            <p className="text-sm font-bold leading-relaxed text-[var(--pp-text)]">
              {demoRunning ? `${notice} Next cycle in 5 seconds.` : notice}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">Unrecovered</p>
              <p className="mt-1 text-xl font-bold tracking-tight text-[var(--pp-amber)]">{formatMoney(activeDebtCents)}</p>
            </div>
            <div className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">Targets</p>
              <p className="mt-1 text-xl font-bold tracking-tight">{demoState.debtors.length}</p>
            </div>
            <div className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">Settled</p>
              <p className="mt-1 text-xl font-bold tracking-tight text-[var(--pp-green)]">{paidCount}</p>
            </div>
            <div className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-3">
              <p className="text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">Audit Logs</p>
              <p className="mt-1 text-xl font-bold tracking-tight">{sortedEvents.length}</p>
            </div>
          </div>

          {currentExpenseActive && (
            <div className="mt-6 border-t border-[var(--pp-border)] pt-5">
              <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[var(--pp-text-dim)]">
                <span>Total Recovery Progress</span>
                <span className="text-[var(--pp-green)]">{recoveryProgressPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden bg-[var(--pp-border)]">
                <div
                  className="h-full bg-[var(--pp-green)] shadow-[0_0_10px_rgba(0,230,118,0.4)] transition-all duration-700 ease-out"
                  style={{ width: `${recoveryProgressPercent}%` }}
                />
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-4">
          <div className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--pp-text-dim)]">Target Expense</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                  {currentExpenseActive ? defaultExpense.title : "Agent Standby"}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--pp-text-muted)]">
                  {currentExpenseActive
                    ? `PesterPay is actively recovering funds for "${defaultExpense.title}", originally paid by ${defaultExpense.paidBy}. Monitoring ${demoState.debtors.length} debtors for payment reconciliation.`
                    : "System ready. Enter repayment amounts to observe the autonomous debt collection lifecycle in action."}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="min-w-28 border border-[var(--pp-border)] p-3">
                  <p className="text-[var(--pp-text-dim)] uppercase text-[10px] font-bold">Total Bill</p>
                  <p className="mt-1 text-lg font-bold">{currentExpenseActive ? formatMoney(expectedTotalCents) : "--"}</p>
                </div>
                <div className="min-w-28 border border-[var(--pp-border)] p-3">
                  <p className="text-[var(--pp-text-dim)] uppercase text-[10px] font-bold">Targets</p>
                  <p className="mt-1 text-lg font-bold">{demoState.debtors.length}</p>
                </div>
                <div className="min-w-28 border border-[var(--pp-border)] p-3">
                  <p className="text-[var(--pp-text-dim)] uppercase text-[10px] font-bold">Status</p>
                  <p className="mt-1 text-lg font-bold text-[var(--pp-lime)]">{overallStatus.toUpperCase()}</p>
                </div>
              </div>
            </div>
          </div>

          <NarratorPanel debtors={demoState.debtors} events={sortedEvents} />

          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <section className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Debtor cards</h2>
                <p className="text-xs uppercase text-[var(--pp-text-dim)]">Core Agent Workflow Policy</p>
              </div>

              {demoState.debtors.length === 0 ? (
                <div className="flex flex-col items-center justify-center border border-dashed border-[var(--pp-border-strong)] py-20 text-center">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--pp-text-dim)]">No Active Debtors</p>
                  <p className="mt-2 text-sm text-[var(--pp-text-muted)]">Initialize the system to begin autonomous recovery.</p>
                  <div className="mt-6 h-px w-12 bg-[var(--pp-border-strong)]"></div>
                  <p className="mt-6 text-[10px] uppercase text-[var(--pp-text-dim)]">Awaiting &quot;Enter Amounts&quot; command</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {demoState.debtors.map((debtor) => (
                    <article key={debtor.id} className={`border-l-4 border-y border-r p-5 transition-colors ${stateTone(debtor.state)}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-bold tracking-tight text-[var(--pp-text)]">{debtor.name}</h3>
                          <p className="mt-1 text-sm font-bold text-[var(--pp-text-muted)] uppercase">
                            {formatMoney(debtor.amountCents, debtor.currency)} Owed
                          </p>
                        </div>
                        <span className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${stateTone(debtor.state)}`}>
                          {stateLabels[debtor.state]}
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-2">
                        <div className="border border-[var(--pp-border)] bg-[var(--pp-bg-soft)] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">Paid Back</p>
                          <p className="mt-1 text-lg font-bold tracking-tight text-[var(--pp-green)]">
                            {formatMoney(getPaidBackCents(debtor, demoState.payments), debtor.currency)}
                          </p>
                        </div>
                        <div className="border border-[var(--pp-border)] bg-[var(--pp-bg-soft)] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">Remaining</p>
                          <p className="mt-1 text-lg font-bold tracking-tight text-[var(--pp-amber)]">
                            {formatMoney(Math.max(debtor.amountCents - getPaidBackCents(debtor, demoState.payments), 0), debtor.currency)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6">
                        <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">
                          <span>Escalation Severity</span>
                          <span className={debtor.escalationLevel > 0 ? "text-[var(--pp-amber)]" : ""}>{debtor.escalationLevel} / 3</span>
                        </div>
                        <div className="flex h-1.5 w-full gap-1 bg-[var(--pp-border)]">
                          <div className={`h-full flex-1 transition-colors ${debtor.escalationLevel >= 1 ? "bg-[var(--pp-amber)]" : "bg-[var(--pp-border-strong)] opacity-20"}`} />
                          <div className={`h-full flex-1 transition-colors ${debtor.escalationLevel >= 2 ? "bg-[var(--pp-amber)]" : "bg-[var(--pp-border-strong)] opacity-20"}`} />
                          <div className={`h-full flex-1 transition-colors ${debtor.escalationLevel >= 3 ? "bg-[var(--pp-red)]" : "bg-[var(--pp-border-strong)] opacity-20"}`} />
                        </div>
                      </div>

                      <dl className="mt-6 space-y-3">
                        <div className="flex items-center justify-between border-t border-[var(--pp-border)] pt-3 text-[11px]">
                          <dt className="font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">Reference</dt>
                          <dd className="font-mono font-bold text-[var(--pp-text)]">
                            <a className="text-[var(--pp-lime)] hover:text-[var(--pp-green)]" href="https://settleup.starlingbank.com/samuel-hollis-994d22" target="_blank" rel="noopener noreferrer">
                              {debtor.paymentReference}
                            </a>
                          </dd>
                        </div>
                        <div className="flex items-center justify-between border-t border-[var(--pp-border)] pt-3 text-[11px]">
                          <dt className="font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">Last Contact</dt>
                          <dd className="font-bold text-[var(--pp-text)]">
                            {formatTime(getLastContacted(debtor, sortedEvents))}
                          </dd>
                        </div>
                        <div className="mt-4 border border-[var(--pp-border-strong)] bg-[var(--pp-bg-soft)] p-3 shadow-inner">
                          <dt className="mb-1 text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">Autonomous Strategy</dt>
                          <dd className="text-xs font-bold leading-relaxed text-[var(--pp-lime)]">
                            {nextActionLabel(debtor.state)}
                          </dd>
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
                  <div className="flex flex-col items-center justify-center border border-dashed border-[var(--pp-border-strong)] py-12 text-center">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--pp-text-dim)]">Audit Trail Empty</p>
                    <p className="mt-2 text-[10px] text-[var(--pp-text-muted)]">Awaiting agent logs and autonomous state transitions.</p>
                  </div>
                ) : (
                  sortedEvents.map((event) => {
                    const debtor = demoState.debtors.find((candidate) => candidate.id === event.entityId);
                    const info = eventStatusInfo(event.eventType);

                    return (
                      <article key={event.id} className="border-l-2 border-[var(--pp-border-strong)] py-1 pl-4">
                        <div className="border border-[var(--pp-border)] bg-[var(--pp-bg-soft)] p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pp-border)] pb-2">
                            <p className="font-mono text-[10px] text-[var(--pp-text-dim)]">{formatTime(event.createdAt)}</p>
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${info.color}`}>
                              {info.label}
                            </p>
                          </div>
                          <p className="text-sm leading-relaxed text-[var(--pp-text)]">{event.message}</p>
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">
                            RE: {debtor?.name ?? event.entityId}
                          </p>
                          {metadataRows(event.metadata).length > 0 ? (
                            <dl className="mt-3 grid gap-1 border-t border-[var(--pp-border)] pt-3 font-mono text-[10px] text-[var(--pp-text-muted)]">
                              {metadataRows(event.metadata).map(([key, value]) => (
                                <div className="flex justify-between gap-3" key={key}>
                                  <dt className="uppercase">{key}</dt>
                                  <dd className="max-w-44 truncate text-right font-bold text-[var(--pp-text)]">
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
      {amountModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <form
            className="w-full max-w-md border border-[var(--pp-border-strong)] bg-[var(--pp-panel)] p-5 shadow-2xl"
            onSubmit={handleStartDemo}
          >
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--pp-lime)]">Demo Setup</p>
              <h2 className="mt-2 text-xl font-bold tracking-tight">Enter Amounts</h2>
            </div>

            <div className="grid gap-3">
              {(["Dev", "Lucia", "Hamza"] as const).map((name) => (
                <label className="grid gap-1" key={name}>
                  <span className="text-[10px] font-bold uppercase tracking-tight text-[var(--pp-text-dim)]">
                    {name}
                  </span>
                  <input
                    className="border border-[var(--pp-border)] bg-[var(--pp-bg)] px-3 py-2 font-mono text-sm text-[var(--pp-text)] outline-none focus:border-[var(--pp-lime)]"
                    min="0"
                    onChange={(event) =>
                      setAmountInputs((current) => ({
                        ...current,
                        [name]: event.target.value,
                      }))
                    }
                    required
                    step="0.01"
                    type="number"
                    value={amountInputs[name]}
                  />
                </label>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="border border-[var(--pp-border-strong)] px-3 py-3 text-left text-sm font-bold hover:border-[var(--pp-text)] disabled:cursor-wait disabled:opacity-50"
                disabled={runningAction !== null}
                onClick={() => setAmountModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="border border-[var(--pp-lime)] px-3 py-3 text-left text-sm font-bold text-[var(--pp-lime)] hover:bg-[var(--pp-lime)] hover:text-black disabled:cursor-wait disabled:opacity-50"
                disabled={runningAction !== null}
                type="submit"
              >
                Start Demo
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
