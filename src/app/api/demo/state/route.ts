import { listEvents } from "@/lib/events";
import { listDebtors, listDemoPayments, listExpenses } from "@/lib/store";

export async function GET() {
  return Response.json({
    expenses: listExpenses(),
    debtors: listDebtors(),
    payments: listDemoPayments(),
    events: listEvents(),
  });
}
