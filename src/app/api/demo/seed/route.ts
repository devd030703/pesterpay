import { listEvents } from "@/lib/events";
import { seedDemo } from "@/lib/store";

export async function POST() {
  const { expense, debtors } = seedDemo();

  return Response.json({
    expense,
    debtors,
    events: listEvents(),
  });
}
