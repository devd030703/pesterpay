import { generateAgentMessage } from "@/lib/ollama";
import { isMessagePolicy } from "@/lib/messageTemplates";
import { getDebtor, getExpense } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const debtorId = typeof body.debtorId === "string" ? body.debtorId : undefined;

  if (!debtorId) {
    return Response.json({ ok: false, message: "debtorId is required." }, { status: 400 });
  }

  const debtor = getDebtor(debtorId);
  if (!debtor) {
    return Response.json({ ok: false, message: `Debtor ${debtorId} not found.` }, { status: 404 });
  }

  const message = await generateAgentMessage({
    debtor,
    expense: getExpense(debtor.expenseId),
    escalationLevel: typeof body.escalationLevel === "number" ? body.escalationLevel : debtor.escalationLevel,
    paymentLink: typeof body.paymentLink === "string" ? body.paymentLink : undefined,
    policy: typeof body.policy === "string" && isMessagePolicy(body.policy) ? body.policy : undefined,
    channel: body.channel === "call_script" ? "call_script" : "sms",
  });

  return Response.json({ ok: true, message });
}
