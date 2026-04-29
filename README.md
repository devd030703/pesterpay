# PesterPay

PesterPay is a hackathon demo for the **Social Debt Agent**: an AI-powered repayment agent that splits informal debts, chases people across SMS and voice, tracks payment through Starling, and stops automatically when the correct amount is received.

The demo is intentionally narrow. Build the reliable fake/demo loop first; add real integrations only after the dashboard, deterministic state machine, Agent Tick, event timeline, and demo payment flow work end to end.

## Start Here

| Need | File |
| --- | --- |
| Agent rules | [AGENTS.md](AGENTS.md) |
| Product brief | [docs/product-brief.md](docs/product-brief.md) |
| Architecture notes | [docs/architecture.md](docs/architecture.md) |
| Build plan | [docs/build-plan.md](docs/build-plan.md) |
| Environment template | [.env.example](.env.example) |

## Product

The user enters a natural-language expense:

> I paid GBP 96 for dinner at Dishoom. Split it between Lucia, Hamza and Sam.

PesterPay creates debtor records, generates payment references, sends escalating SMS/call follow-ups, checks payment status, computes a payment reconciliation confidence score, updates debtor state, and logs every step in an event timeline.

## Demo Flow

1. Create an expense from natural language.
2. Parse the expense and split it into debtors.
3. Show debtor cards on the dashboard.
4. Click **Run Agent Tick** to send SMS 1.
5. Click **Run Agent Tick** again to check payment.
6. If unpaid, send SMS 2.
7. On the next tick, trigger a voice call.
8. Use `/pay/[reference]` or a manual demo button to mark payment found.
9. Show the payment confidence score.
10. Move the debtor to `payment_matched`, then `closed`.
11. Show every step in the event timeline.

Demo scenario:

| Field | Value |
| --- | --- |
| Expense | Dinner at Dishoom |
| Total | GBP 96 |
| Paid by | Dev |
| Debtors | Lucia, Hamza, Sam |
| Split | GBP 32 each |
| Demo reference | `SAM-DISH-32` |
| Real demo recipient | Sam only |

## Core Priorities

| Priority | Build |
| --- | --- |
| P0 | Dashboard, create expense flow, debtor split, state machine, Agent Tick, event timeline, template messages, `/pay/[reference]` |
| P1 | Ollama copy generation, Twilio SMS, Twilio Voice, Starling Settle Up link, unique payment references |
| P2 | Starling polling, payment reconciliation confidence score, Agent Control Centre, escalation policy selector |

## Architecture Principle

The deterministic state machine controls all financial and payment logic.

LLMs/Ollama may generate communication copy only. LLM output must never decide:

- whether someone has paid
- whether a debt is closed
- which state transition happens next
- whether escalation should happen
- whether a payment match is valid

Financial state must come from deterministic code, explicit rules, and auditable events.

## Expected Lifecycle

Primary debtor lifecycle:

```text
created -> sms_1_sent -> sms_2_sent -> call_triggered -> payment_matched -> closed
```

Allowed side states when needed:

```text
paused
disputed
failed/manual_review
```

Every state transition must write an event.

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

## Demo Mode And Safety Rails

- Demo recipient should be Sam only.
- Max messages per debtor in demo: 3.
- Max calls per debtor in demo: 1.
- Use template fallbacks whenever Ollama, Twilio, or Starling fails.
- Do not use abusive, threatening, illegal, or fake debt-collector content.
- Do not pretend to be a bank, regulator, court, solicitor, or legal debt collector.
- Make fallback paths visible in the UI so the demo can recover.

## In Scope

- Next.js App Router app
- TypeScript
- Tailwind
- In-memory or local JSON store while the demo loop is being built
- Clean service files in `/lib` or `src/lib`
- API routes under `/app/api` or `src/app/api`
- Seed/reset demo endpoints

Expected product pieces:

```text
app/page.tsx or src/app/page.tsx
app/expenses/new/page.tsx
app/expenses/[id]/page.tsx
app/pay/[reference]/page.tsx
components/DebtorCard.tsx
components/EventTimeline.tsx
components/AgentControlCentre.tsx
components/PaymentConfidenceCard.tsx
lib/stateMachine.ts
lib/agent.ts
lib/events.ts
lib/payments.ts
lib/messageTemplates.ts
lib/ollama.ts
lib/twilio.ts
lib/starling.ts
```

## Out Of Scope

- Auth
- Mobile app
- Receipt OCR
- Multiple banks
- WhatsApp real integration
- Complex database setup before the demo loop works
- Broad architectural rewrites during hackathon mode

## Local Setup

Install dependencies:

```bash
npm install
```

Create local environment variables:

```bash
cp .env.example .env.local
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

These are defined in [.env.example](.env.example):

| Variable | Purpose |
| --- | --- |
| `OLLAMA_MODEL` | Local Ollama model, default `llama3.2:3b` |
| `OLLAMA_BASE_URL` | Ollama server URL, default `http://localhost:11434` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio sender number |
| `DEMO_SAM_PHONE_NUMBER` | Only real demo recipient |
| `STARLING_ACCESS_TOKEN` | Starling API token (read-only) |
| `STARLING_ACCOUNT_UID` | Starling account UID |
| `STARLING_CATEGORY_UID` | Starling category UID |
| `STARLING_SETTLE_UP_LINK` | Pre-generated Settle Up link for demo |
| `NEXT_PUBLIC_DEMO_BASE_URL` | Base URL for demo payment links, default `http://localhost:3000` |

All integrations degrade to local/template behavior when variables are missing.

## Integration Contracts

### Twilio

- Only `DEMO_SAM_PHONE_NUMBER` should receive real SMS or calls in demo mode.
- Maximum 3 messages per debtor (`DEMO_MAX_MESSAGES_PER_DEBTOR`).
- Maximum 1 call per debtor (`DEMO_MAX_CALLS_PER_DEBTOR`).
- No abusive, threatening, or coercive content.
- Do not represent PesterPay as a bank, regulator, court, solicitor, or debt collector.
- Missing credentials fall back to a logged template event, leaving the demo running.

### Starling

- Read-only transaction polling for payment reconciliation only.
- Never write payment data or move money through the Starling integration.
- `STARLING_SETTLE_UP_LINK` is a pre-generated payment link — include it in messages.
- Missing credentials fall back to the `/pay/[reference]` demo payment page.

### Ollama

- Generates SMS copy and voice call scripts only.
- Must never decide payment status, state transitions, or debt closure.
- Missing `OLLAMA_BASE_URL` falls back to `messageTemplates` automatically.

These contracts are enforced by helper checks in `src/lib/demoSafety.ts`.

## Commands

Scripts currently available in [package.json](package.json):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Build production app |
| `npm run start` | Start production server after build |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests (`src/**/*.test.ts`) |

## Multica Issue Guidance

Use small, concrete issues:

- One issue = one deliverable.
- Include acceptance criteria.
- Include files likely to touch.
- Include the verification command, usually `npm run lint` and/or `npm run build`.
- Include demo impact: what the judge will see.
- Avoid vague issues like "polish the app".
- Avoid broad architectural rewrites during hackathon mode.

Agent assignment:

| Agent | Use for |
| --- | --- |
| PesterPay Architect | Architecture decisions, state machine changes, data model decisions, Starling reconciliation design, integration boundaries, high-leverage technical review |
| PesterPay Builder | Implementation issues with clear acceptance criteria, routes, UI components, services, Twilio/Starling/Ollama wiring, demo buttons, bug fixes |
| PesterPay Reviewer | Demo hardening, code review, UI/copy polish, edge cases, fallback paths, judging clarity, final presentation readiness |
