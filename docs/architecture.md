# Architecture

## Core Principle

The deterministic state machine controls all financial and payment logic.

LLMs/Ollama generate communication copy only. They must never decide payment status, closure, escalation, state transitions, or payment-match validity.

## Main Modules

Expected service files:

| File | Responsibility |
| --- | --- |
| `src/lib/stateMachine.ts` | Allowed debtor states and transitions |
| `src/lib/agent.ts` | Agent Tick orchestration |
| `src/lib/events.ts` | Append/read event timeline entries |
| `src/lib/payments.ts` | Payment references, matching, confidence score |
| `src/lib/messageTemplates.ts` | Fallback SMS/call copy |
| `src/lib/ollama.ts` | Optional copy generation |
| `src/lib/twilio.ts` | Optional SMS/voice integration with fallbacks |
| `src/lib/starling.ts` | Optional Starling links and transaction polling |

Expected UI/routes:

| File | Responsibility |
| --- | --- |
| `src/app/page.tsx` | Dashboard |
| `src/app/expenses/new/page.tsx` | Natural-language expense creation |
| `src/app/expenses/[id]/page.tsx` | Expense detail |
| `src/app/pay/[reference]/page.tsx` | Demo payment page |
| `src/components/DebtorCard.tsx` | Debtor status and actions |
| `src/components/EventTimeline.tsx` | Auditable event log |
| `src/components/AgentControlCentre.tsx` | Agent Tick and policy controls |
| `src/components/PaymentConfidenceCard.tsx` | Reconciliation score display |

## State Machine

Primary lifecycle:

```text
created -> sms_1_sent -> sms_2_sent -> call_triggered -> payment_matched -> closed
```

Side states:

```text
paused
disputed
failed/manual_review
```

Requirements:

- Transitions happen in deterministic code.
- Every transition writes an event.
- Events should include previous state, next state, reason, timestamp, and relevant metadata.
- Agent Tick must be idempotent enough for demo use.
- Demo limits must be enforced in code, not in copy.

## Agent Tick

Agent Tick is the manual demo trigger. It should:

1. Load current debtor/expense state.
2. Decide the next deterministic action.
3. Generate or select copy.
4. Send real integration call if configured, otherwise record fallback behavior.
5. Reconcile payment when applicable.
6. Apply one valid transition.
7. Write events for actions and transitions.

## Payment Reconciliation

Confidence score:

| Signal | Points |
| --- | ---: |
| Exact amount match | +40 |
| Exact reference match | +40 |
| Transaction after request created | +10 |
| Incoming transaction | +10 |

Decision rules:

| Score / condition | Result |
| --- | --- |
| `>= 80` | Auto-close / payment matched |
| `50-79` | Probable match, manual review |
| `< 50` | No match |
| Correct reference + wrong amount | Partial payment |

The UI should show why a score was assigned.

## Integration Boundaries

- Ollama: optional copy generation only.
- Twilio: optional transport for SMS/voice.
- Starling: optional Settle Up link and transaction polling.
- Missing credentials must not block the demo.
- Template/local fallback behavior should still create visible events.

## Storage

Use in-memory or local JSON storage until the demo loop works. Keep data shapes simple and explicit:

- expense
- debtor
- event
- payment candidate / payment match
- escalation policy

Avoid introducing a complex database before the P0 flow works.
