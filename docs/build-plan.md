# Build Plan

## Current Reality

The repo is a Next.js App Router project. At the time this doc was written, the app is still close to the starter scaffold and the product loop has not been implemented.

## Build Order

### P0: Fake/Demo Loop First

Build these before real integrations:

1. Dashboard shell.
2. Natural-language create expense flow.
3. Parser for the Dishoom demo case.
4. Debtor records and payment references.
5. Deterministic state machine.
6. Event timeline.
7. Agent Tick button and endpoint.
8. Template SMS/call messages.
9. Demo payment page `/pay/[reference]`.
10. Seed/reset demo endpoints.

Done means: a judge can click through the full lifecycle without Twilio, Starling, or Ollama.

### P1: Real-ish Integrations

Add only after P0 works:

1. Ollama SMS copy generation.
2. Ollama voice call script generation.
3. Twilio SMS.
4. Twilio Voice.
5. Starling Settle Up link.
6. Unique payment references.

Each integration must have a fallback path.

### P2: Hardening And Polish

1. Starling transaction polling.
2. Payment reconciliation confidence score.
3. Agent Control Centre.
4. Escalation policy selector.
5. Demo edge-case handling.

## Verification Expectations

Use available scripts:

```bash
npm run lint
npm run build
npm test
```

Manual demo script:

1. Start with seeded/reset state.
2. Create: "I paid GBP 96 for dinner at Dishoom. Split it between Lucia, Hamza and Sam."
3. Confirm Lucia, Hamza, and Sam owe GBP 32 each.
4. Run Agent Tick until Sam reaches SMS 1, SMS 2, call triggered.
5. Open `/pay/SAM-DISH-32` or use manual payment found.
6. Confirm confidence score explanation.
7. Confirm Sam reaches `payment_matched`, then `closed`.
8. Confirm the event timeline shows each step.

## Multica Issues To Prefer

Good:

- Build the state machine and event writer.
- Add Agent Tick endpoint for the first SMS transition.
- Create demo payment page for references.
- Add confidence score display.
- Wire Twilio with fallback.

Avoid:

- "Polish the whole app."
- "Refactor architecture."
- "Add production auth."
- "Make all integrations real" as one issue.
- "Use AI to decide whether payment is valid."

## Agent Assignment

| Agent | Best work |
| --- | --- |
| PesterPay Architect | State machine design, payment model, reconciliation rules, integration boundaries |
| PesterPay Builder | Routes, components, service implementation, demo controls, bug fixes |
| PesterPay Reviewer | Demo hardening, copy, edge cases, fallback paths, judge clarity |
