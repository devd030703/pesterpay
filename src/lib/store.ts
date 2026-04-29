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
};

export function createDebtor(input: CreateDebtorInput): Debtor {
  const now = new Date().toISOString();
  const debtor: Debtor = {
    id: nanoid(),
    expenseId: input.expenseId,
    name: input.name,
    phone: input.phone,
    amountCents: input.amountCents,
    currency: input.currency ?? "GBP",
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

  const expenseId = `demo-expense-${nanoid(6)}`;

  return [
    createDebtor({
      expenseId,
      name: "Maya",
      phone: "+447700900101",
      amountCents: 1850,
    }),
    createDebtor({
      expenseId,
      name: "Ollie",
      phone: "+447700900102",
      amountCents: 1850,
    }),
    createDebtor({
      expenseId,
      name: "Priya",
      phone: "+447700900103",
      amountCents: 1850,
    }),
  ];
}

