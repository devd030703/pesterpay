import { agentTick } from "@/lib/agent";
import { listEvents } from "@/lib/events";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = agentTick({
    debtorId: typeof body.debtorId === "string" ? body.debtorId : undefined,
  });

  const status = result.ok ? 200 : 400;

  return Response.json(
    {
      ...result,
      events: result.ok ? listEvents(result.debtor.id) : listEvents(),
    },
    { status },
  );
}

