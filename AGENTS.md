# PesterPay / Social Debt Agent — Agent Instructions

## Mission

Build a hackathon demo called PesterPay, also known as the Social Debt Agent.

It is an autonomous payment operations agent for informal debt. The user enters one natural-language expense, and the system splits the debt, chases debtors, logs events, reconciles payment, and stops chasing once paid.

## Product Principle

This is not a generic chatbot.

The deterministic state machine controls all financial/payment logic.
The LLM/Ollama only generates communication copy.
pest
If Ollama fails, use template fallbacks.

## Demo Scenario

Expense:
- Dinner at Dishoom
- Total: £96
- Paid by: Dev
- Debtors: Lucia, Hamza, Sam
- £32 each
- Demo payment reference format: SAM-DISH-32

Core demo flow:
1. User creates expense from natural language.
2. App parses expense and creates debtor records.
3. Dashboard shows debtor cards.
4. Agent tick sends SMS 1.
5. Next tick checks payment.
6. If not paid, sends SMS 2.
7. Next tick triggers voice call.
8. Demo payment page or manual button marks payment found.
9. Payment confidence score is shown.
10. Debtor moves to payment_matched then closed.
11. Event timeline shows every step.

## Priority Order

P0:
- Dashboard
- Create expense
- Split into debtors
- Debtor state machine
- Run Agent Tick button
- Event timeline
- Template generated messages
- Demo payment page `/pay/[reference]`

P1:
- Ollama SMS generation
- Ollama call script generation
- Twilio SMS
- Twilio Voice
- Starling Settle Up link
- Unique payment references

P2:
- Starling polling
- Payment reconciliation confidence score
- Agent Control Centre
- Escalation policy selector

Do not build:
- Auth
- Mobile app
- Receipt OCR
- Multiple banks
- WhatsApp real integration
- Overly complex database setup before the demo loop works

## Technical Shape

Use:
- Next.js App Router
- TypeScript
- Tailwind
- In-memory/local JSON store first if needed
- Clean service files in `/lib`
- API routes in `/app/api`

Important files expected:
- `/lib/stateMachine.ts`
- `/lib/agent.ts`
- `/lib/events.ts`
- `/lib/payments.ts`
- `/lib/messageTemplates.ts`
- `/lib/ollama.ts`
- `/lib/twilio.ts`
- `/lib/starling.ts`

Frontend expected:
- `/app/page.tsx`
- `/app/expenses/new/page.tsx`
- `/app/expenses/[id]/page.tsx`
- `/app/pay/[reference]/page.tsx`
- `/components/DebtorCard.tsx`
- `/components/EventTimeline.tsx`
- `/components/AgentControlCentre.tsx`
- `/components/PaymentConfidenceCard.tsx`

## Engineering Rules

- Keep the demo reliable.
- Prefer visible working flow over perfect architecture.
- Every state transition must write an event.
- Do not let LLM output control state transitions.
- Use template fallback for every integration.
- Add seed/reset demo endpoints.
- Avoid hidden magic.
- Keep functions small and testable.