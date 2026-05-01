# PesterPay Agent Guide

Use this file as the fast context window for coding agents. Keep changes demo-first, deterministic, and easy to verify.

## Mission

Build PesterPay, the **Social Debt Agent** hackathon demo.

One-line product: an AI-powered repayment agent that splits informal debts, chases people across SMS and voice, tracks payment through Starling, and stops automatically when the correct amount is received.

## Start Here

1. Read [README.md](README.md) for setup, commands, and product scope.
2. Read [docs/architecture.md](docs/architecture.md) before touching state, payments, or integrations.
3. Read [docs/build-plan.md](docs/build-plan.md) before choosing what to implement next.

## Product Flow

Demo expense:

- Dinner at Dishoom
- Total: GBP 7
- Paid by: Dev
- Debtors: Lucia, Hamza, Dev
- Split: Dev GBP 5; Lucia and Hamza GBP 1 each
- Demo payment reference: `SAM-DISH-2`

Core flow:

1. User creates expense from natural language.
2. App parses expense and creates debtor records.
3. Dashboard shows debtor cards.
4. **Agent Tick** sends SMS 1.
5. Next tick checks payment.
6. If unpaid, send SMS 2.
7. Next tick triggers voice call.
8. Demo payment page or manual button marks payment found.
9. Payment confidence score is shown.
10. Debtor moves to `payment_matched`, then `closed`.
11. Event timeline shows every step.

## Architecture Rules

- This is not a generic chatbot.
- The deterministic state machine controls financial/payment logic.
- The agent runner advances debtors through explicit transitions.
- Every state transition must write an event.
- Payment reconciliation must be deterministic and auditable.
- Use template fallbacks for every integration.
- Keep functions small, typed, and easy to test.
- Prefer visible working demo flow over perfect architecture.

## State Machine Rules

Primary lifecycle:

```text
created -> sms_1_sent -> sms_2_sent -> call_triggered -> payment_matched -> closed
```

Side states, if needed:

```text
paused
disputed
failed/manual_review
```

Rules:

- Only deterministic code may transition state.
- Do not skip event logging.
- Do not close a debtor because an LLM says they paid.
- Do not escalate beyond demo limits.
- Keep transition reasons visible in the event timeline.

## LLM / Ollama Rules

Ollama may generate:

- SMS copy
- Voice call scripts
- Friendly wording variants

Ollama must never decide:

- whether someone has paid
- whether a debt is closed
- which transition happens next
- whether escalation should happen
- whether a payment match is valid

If Ollama fails or is unavailable, use `messageTemplates` fallbacks.

## Financial Safety Rules

Payment confidence scoring:

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

Do not represent PesterPay as a bank, regulator, solicitor, court, or legal debt collector. Do not generate abusive, threatening, illegal, or coercive debt-collection content.

## Demo Rails

- Demo recipient should be Dev only.
- Max messages per debtor in demo: 3 (`DEMO_MAX_MESSAGES_PER_DEBTOR` in `src/lib/demoSafety.ts`).
- Max calls per debtor in demo: 1 (`DEMO_MAX_CALLS_PER_DEBTOR` in `src/lib/demoSafety.ts`).
- Integrations must fail soft and leave the demo usable.
- Add seed/reset demo endpoints.
- Prefer in-memory/local JSON storage until the loop works.

## Integration Contracts

Use `src/lib/demoSafety.ts` helpers in integration routes:

- `isTwilioConfigured()` — use to decide live SMS/call vs. template fallback.
- `isOllamaConfigured()` — use to decide LLM copy generation vs. template fallback.
- `isStarlingConfigured()` — use to decide live polling vs. demo payment fallback.

### Twilio contract

- Only `DEMO_SAM_PHONE_NUMBER` receives real messages or calls.
- Never exceed `DEMO_MAX_MESSAGES_PER_DEBTOR` or `DEMO_MAX_CALLS_PER_DEBTOR`.
- Content must not be abusive, threatening, or coercive.
- Do not represent PesterPay as a bank, regulator, court, solicitor, or debt collector.
- When `isTwilioConfigured()` is false, log a fallback event and continue.

### Starling contract

- Read-only access only (transaction polling for reconciliation).
- Never write payment data or initiate money movement.
- When `isStarlingConfigured()` is false, direct users to `/pay/[reference]`.

### Ollama contract

- Copy generation only (SMS messages and voice scripts).
- Never allow Ollama output to trigger state transitions or close debts.
- When `isOllamaConfigured()` is false, fall back to `messageTemplates`.

## Priority Order

| Priority | Build |
| --- | --- |
| P0 | Dashboard, create expense, debtor split, state machine, Agent Tick, event timeline, template messages, `/pay/[reference]` |
| P1 | Ollama SMS/call copy, Twilio SMS, Twilio Voice, Starling Settle Up link, unique payment references |
| P2 | Starling polling, confidence score UI, Agent Control Centre, escalation policy selector |

## Expected File Map

Use the existing `src/` layout unless the repo moves away from it.

```text
src/app/page.tsx
src/app/expenses/new/page.tsx
src/app/expenses/[id]/page.tsx
src/app/pay/[reference]/page.tsx
src/app/api/...
src/components/DebtorCard.tsx
src/components/EventTimeline.tsx
src/components/AgentControlCentre.tsx
src/components/PaymentConfidenceCard.tsx
src/lib/stateMachine.ts
src/lib/agent.ts
src/lib/events.ts
src/lib/payments.ts
src/lib/messageTemplates.ts
src/lib/ollama.ts
src/lib/twilio.ts
src/lib/starling.ts
```

## Do Not Build

- Auth
- Mobile app
- Receipt OCR
- Multiple banks
- WhatsApp real integration
- Complex database setup before the demo loop works
- Generic chatbot features
- Broad rewrites without direct demo payoff

## How To Make Changes Safely

- Inspect existing files first.
- Keep patches scoped to the issue.
- Preserve user changes in the working tree.
- Add or update focused tests when touching deterministic logic.
- Use clear names for states, events, and payment decisions.
- Keep UI copy short and judge-readable.
- Include fallback behavior in integrations.

## Verification

Use real package scripts only:

```bash
npm run lint
npm run build
npm test
```

Manual demo verification:

- Create Dishoom expense.
- Confirm debtor cards render.
- Run Agent Tick through SMS 1, SMS 2, call, payment matched, closed.
- Confirm event timeline records every transition.
- Confirm `/pay/[reference]` can trigger the demo payment path.
- Confirm integration failures fall back to templates/manual demo controls.

## Agent Assignment

| Agent | Use for |
| --- | --- |
| PesterPay Architect | Architecture decisions, state machine changes, data model decisions, Starling reconciliation design, integration boundaries, high-leverage technical review |
| PesterPay Builder | Implementation issues with clear acceptance criteria, routes, UI components, services, Twilio/Starling/Ollama wiring, demo buttons, bug fixes |
| PesterPay Reviewer | Demo hardening, code review, UI/copy polish, edge cases, fallback paths, judging clarity, final presentation readiness |

## Multica Issue Guidance

Good Multica issues are small and verifiable:

- One issue = one deliverable.
- Include acceptance criteria.
- Include files likely to touch.
- Include verification commands.
- Include demo impact.
- Avoid vague "polish the app" issues.
- Avoid broad architectural rewrites during hackathon mode.

Suggested issue shape:

```text
Title: Build Agent Tick transition from created to sms_1_sent

Agent: PesterPay Builder
Goal: Add a deterministic Agent Tick endpoint that sends/fakes SMS 1.
Likely files: src/lib/stateMachine.ts, src/lib/agent.ts, src/lib/events.ts, src/app/api/agent/tick/route.ts
Acceptance criteria:
- Created debtors move to sms_1_sent on tick.
- Event timeline records the transition and message body.
- Missing Twilio config uses template fallback.
Verification: npm run lint && npm run build
Demo impact: Dashboard can show the first visible autonomous chase step.
```
