import { resetEvents } from "@/lib/events";
import { resetDebtors, resetExpenses } from "@/lib/store";

export async function POST() {
  resetDebtors();
  resetExpenses();
  resetEvents();

  return Response.json({
    ok: true,
    expenses: [],
    debtors: [],
    events: [],
  });
}
