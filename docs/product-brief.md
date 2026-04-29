# Product Brief

## What PesterPay Is

PesterPay is the Social Debt Agent: a hackathon demo for informal debt repayment operations.

The user enters one natural-language expense. The app splits the debt, creates debtor records, chases debtors through SMS and voice, checks payment status, computes payment reconciliation confidence, updates state, and logs every event.

## Problem

Small group debts are awkward to chase. People forget, messages scatter across apps, and the payer has no clear operational view of who has paid.

PesterPay turns that into a visible workflow: debtors, payment references, follow-ups, reconciliation, and closure.

## Demo Scenario

| Field | Value |
| --- | --- |
| Expense | Dinner at Dishoom |
| Total | GBP 96 |
| Paid by | Dev |
| Debtors | Lucia, Hamza, Sam |
| Split | GBP 32 each |
| Demo reference | `SAM-DISH-32` |

## Judge-Visible Flow

1. Create the Dishoom expense from natural language.
2. Show debtor cards and amount owed.
3. Run Agent Tick to send SMS 1.
4. Run Agent Tick again to check payment and escalate to SMS 2.
5. Run Agent Tick again to trigger a voice call.
6. Use demo payment page `/pay/[reference]` or a manual payment button.
7. Show payment reconciliation confidence score.
8. Move debtor to `payment_matched`, then `closed`.
9. Show the event timeline for the whole flow.

## In Scope

- Demo-first Next.js app
- Deterministic debtor lifecycle
- Event timeline
- Template messages
- Demo payment page
- Ollama copy generation after fallbacks exist
- Twilio and Starling wiring after the fake loop works
- Payment confidence score
- Escalation policy selector if time allows

## Out Of Scope

- Auth
- Mobile app
- Receipt OCR
- Multiple banks
- WhatsApp real integration
- Complex database setup before the core demo loop works
- Generic chatbot behavior

## Safety

- Demo recipient should be Sam only.
- Max messages per debtor in demo: 3.
- Max calls per debtor in demo: 1.
- No abusive, threatening, illegal, or fake debt-collector content.
- Do not claim to be a bank, regulator, solicitor, court, or legal debt collector.
