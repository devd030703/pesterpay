import { listEvents } from "@/lib/events";
import { listDebtors } from "@/lib/store";

export async function GET() {
  return Response.json({
    debtors: listDebtors(),
    events: listEvents(),
  });
}
