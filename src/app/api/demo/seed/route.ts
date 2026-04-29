import { listEvents } from "@/lib/events";
import { listDemoPayments, seedDemo } from "@/lib/store";

export async function POST() {
  const { expense, debtors } = seedDemo();

  return Response.json({
    expense,
    debtors,
    payments: listDemoPayments(),
    events: listEvents(),
  });
}
