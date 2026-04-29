import { listEvents } from "@/lib/events";
import { seedDemoDebtors } from "@/lib/store";

export async function POST() {
  const debtors = seedDemoDebtors();

  return Response.json({
    debtors,
    events: listEvents(),
  });
}

export async function GET() {
  const debtors = seedDemoDebtors();

  return Response.json({
    debtors,
    events: listEvents(),
  });
}

