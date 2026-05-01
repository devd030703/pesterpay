import { agentTick } from "@/lib/agent";
import { listEvents } from "@/lib/events";
import { isMessagePolicy } from "@/lib/messageTemplates";
import { listDebtors, listDemoPayments } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await agentTick({
    debtorId: typeof body.debtorId === "string" ? body.debtorId : undefined,
    policy: typeof body.policy === "string" && isMessagePolicy(body.policy) ? body.policy : undefined,
  });

  const status = result.ok ? 200 : 400;

  return Response.json(
    {
      ...result,
      debtors: listDebtors(),
      payments: listDemoPayments(),
      events: listEvents(),
    },
    { status },
  );
}
