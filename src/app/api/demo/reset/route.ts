import { resetEvents } from "@/lib/events";
import { resetDebtors, resetDemoPayments, resetExpenses } from "@/lib/store";

export async function POST() {
  resetDebtors();
  resetExpenses();
  resetDemoPayments();
  resetEvents();

  return Response.json({
    ok: true,
    expenses: [],
    debtors: [],
    payments: [],
    events: [],
  });
}
