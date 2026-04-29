import { nanoid } from "nanoid";
import { logEvent } from "./events";
import type { Debtor } from "./models";

const debtors = new Map<string, Debtor>();

export type CreateDebtorInput = {
  expenseId: string;
  name: string;
  phone: string;
  amountCents: number;
  currency?: Debtor["currency"];
  paymentReference?: string;
};

function createPaymentReference(name: string, amountCents: number): string {
  return `${name.toUpperCase()}-DISH-${amountCents / 100}`;
}

export function createDebtor(input: CreateDebtorInput): Debtor {
  const now = new Date().toISOString();
  const debtor: Debtor = {
    id: nanoid(),
    expenseId: input.expenseId,
    name: input.name,
    phone: input.phone,
    amountCents: input.amountCents,
    currency: input.currency ?? "GBP",
    paymentReference: input.paymentReference ?? createPaymentReference(input.name, input.amountCents),
    escalationLevel: 0,
    state: "created",
    createdAt: now,
    updatedAt: now,
  };

  debtors.set(debtor.id, debtor);
  logEvent({
    entityType: "debtor",
    entityId: debtor.id,
    eventType: "DEBTOR_CREATED",
    message: `Debtor ${debtor.name} created for demo expense.`,
    metadata: {
      expenseId: debtor.expenseId,
      amountCents: debtor.amountCents,
      currency: debtor.currency,
      paymentReference: debtor.paymentReference,
    },
  });

  return debtor;
}

export function getDebtor(id: string): Debtor | undefined {
  return debtors.get(id);
}

export function listDebtors(): Debtor[] {
  return [...debtors.values()];
}

export function saveDebtor(debtor: Debtor): Debtor {
  debtors.set(debtor.id, debtor);
  return debtor;
}

export function resetDebtors(): void {
  debtors.clear();
}

export function seedDemoDebtors(): Debtor[] {
  if (debtors.size > 0) {
    return listDebtors();
  }

  const expenseId = `demo-dishoom-${nanoid(6)}`;

  return [
    createDebtor({
      expenseId,
      name: "Sam",
      phone: "+447700900111",
      amountCents: 3200,
      paymentReference: "SAM-DISH-32",
    }),
    createDebtor({
      expenseId,
      name: "Lucia",
      phone: "+447700900112",
      amountCents: 3200,
      paymentReference: "LUCIA-DISH-32",
    }),
    createDebtor({
      expenseId,
      name: "Hamza",
      phone: "+447700900113",
      amountCents: 3200,
      paymentReference: "HAMZA-DISH-32",
    }),
  ];
}
