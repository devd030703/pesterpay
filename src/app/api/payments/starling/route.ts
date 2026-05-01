import { listEvents } from "@/lib/events";
import { isStarlingConfigured } from "@/lib/demoSafety";
import { reconcileStarlingSettledTransactions } from "@/lib/payments";
import { listDebtors, listDemoPayments } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const expectedAmountCents = Number.isInteger(body.expectedAmountCents) ? body.expectedAmountCents : undefined;
  const minTransactionTimestamp =
    typeof body.minTransactionTimestamp === "string" ? body.minTransactionTimestamp : undefined;
  const maxTransactionTimestamp =
    typeof body.maxTransactionTimestamp === "string" ? body.maxTransactionTimestamp : undefined;

  if (!isStarlingConfigured()) {
    return Response.json(
      {
        ok: false,
        message: "Starling is not configured. Set STARLING_ACCESS_TOKEN and STARLING_ACCOUNT_UID, or use /pay/[reference].",
        debtors: listDebtors(),
        payments: listDemoPayments(),
        events: listEvents(),
      },
      { status: 503 },
    );
  }

  try {
    const result = await reconcileStarlingSettledTransactions({
      expectedAmountCents,
      minTransactionTimestamp,
      maxTransactionTimestamp,
    });

    return Response.json({
      ...result,
      debtors: listDebtors(),
      payments: listDemoPayments(),
      events: listEvents(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Starling reconciliation failed.",
        debtors: listDebtors(),
        payments: listDemoPayments(),
        events: listEvents(),
      },
      { status: 502 },
    );
  }
}
