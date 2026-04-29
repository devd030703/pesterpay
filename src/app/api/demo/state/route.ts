import { listEvents } from "@/lib/events";
import { listDebtors, listExpenses } from "@/lib/store";

export async function GET() {
  return Response.json({
    expenses: listExpenses(),
    debtors: listDebtors(),
    events: listEvents(),
  });
}
