import { listEvents } from "@/lib/events";
import { submitDemoPayment } from "@/lib/payments";
import { listDebtors, listDemoPayments } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  const reference = typeof body.reference === "string" ? body.reference : "";
  const amountCents = Number.isInteger(body.amountCents) ? body.amountCents : undefined;

  if (!reference) {
    return Response.json({ ok: false, message: "Payment reference is required." }, { status: 400 });
  }

  const result = submitDemoPayment({
    reference,
    amountCents,
  });

  return Response.json(
    {
      ...result,
      debtors: listDebtors(),
      payments: listDemoPayments(),
      events: listEvents(),
    },
    { status: result.ok ? 200 : 404 },
  );
}
