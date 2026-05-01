import { listEvents } from "@/lib/events";
import { listDemoPayments, seedDemo } from "@/lib/store";

function parseAmountCents(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const amounts = typeof body.amountsCents === "object" && body.amountsCents !== null ? body.amountsCents : {};

  const { expense, debtors } = seedDemo({
    amountsCents: {
      Dev: parseAmountCents((amounts as Record<string, unknown>).Dev),
      Lucia: parseAmountCents((amounts as Record<string, unknown>).Lucia),
      Hamza: parseAmountCents((amounts as Record<string, unknown>).Hamza),
    },
  });

  return Response.json({
    expense,
    debtors,
    payments: listDemoPayments(),
    events: listEvents(),
  });
}
