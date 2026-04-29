import { resetEvents } from "@/lib/events";
import { resetDebtors } from "@/lib/store";

export async function POST() {
  resetDebtors();
  resetEvents();

  return Response.json({
    ok: true,
  });
}

