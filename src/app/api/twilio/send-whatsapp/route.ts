import { listEvents } from "@/lib/events";
import { isMessagePolicy } from "@/lib/messageTemplates";
import { generateAgentMessage } from "@/lib/ollama";
import { getDebtor, getExpense } from "@/lib/store";
import { buildPublicDemoPaymentLink } from "@/lib/twilio";
import { sendDemoWhatsApp } from "@/lib/whatsapp";

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

  const expense = getExpense(debtor.expenseId);
  const generatedMessage = await generateAgentMessage({
    debtor,
    expense,
    escalationLevel: typeof body.escalationLevel === "number" ? body.escalationLevel : debtor.escalationLevel || 1,
    paymentLink: buildPublicDemoPaymentLink(debtor.paymentReference),
    policy: typeof body.policy === "string" && isMessagePolicy(body.policy) ? body.policy : undefined,
    channel: "sms",
  });

  const whatsapp = await sendDemoWhatsApp({ debtor, expense, generatedMessage });

  return Response.json(
    {
      ok: whatsapp.ok,
      generatedMessage,
      whatsapp,
      events: listEvents(debtor.id),
    },
    { status: whatsapp.status === "failed" ? 502 : 200 },
  );
}
