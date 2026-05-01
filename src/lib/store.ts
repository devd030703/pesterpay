import { nanoid } from "nanoid";
import { logEvent, resetEvents } from "./events";
import type { Debtor, DemoPayment, Expense } from "./models";

const debtors = new Map<string, Debtor>();
const expenses = new Map<string, Expense>();
const payments = new Map<string, DemoPayment>();

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
    message: `Debtor ${debtor.name} created, owes £${debtor.amountCents / 100} (ref: ${debtor.paymentReference}).`,
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

export function getDebtorByPaymentReference(reference: string): Debtor | undefined {
  const normalizedReference = reference.toUpperCase();
  return [...debtors.values()].find((debtor) => debtor.paymentReference.toUpperCase() === normalizedReference);
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

export type CreateExpenseInput = {
  title: string;
  totalCents: number;
  currency?: Expense["currency"];
  paidBy: string;
};

export function createExpense(input: CreateExpenseInput): Expense {
  const expense: Expense = {
    id: nanoid(),
    title: input.title,
    totalCents: input.totalCents,
    currency: input.currency ?? "GBP",
    paidBy: input.paidBy,
    createdAt: new Date().toISOString(),
  };

  expenses.set(expense.id, expense);
  logEvent({
    entityType: "expense",
    entityId: expense.id,
    eventType: "EXPENSE_CREATED",
    message: `Expense created: ${expense.title}, £${expense.totalCents / 100}.`,
    metadata: {
      title: expense.title,
      totalCents: expense.totalCents,
      currency: expense.currency,
      paidBy: expense.paidBy,
    },
  });

  return expense;
}

export function listExpenses(): Expense[] {
  return [...expenses.values()];
}

export function getExpense(id: string): Expense | undefined {
  return expenses.get(id);
}

export function resetExpenses(): void {
  expenses.clear();
}

export type CreateDemoPaymentInput = {
  debtorId: string;
  reference: string;
  amountCents: number;
  currency?: DemoPayment["currency"];
  direction?: DemoPayment["direction"];
  source?: DemoPayment["source"];
  externalId?: string;
  createdAt?: string;
};

export function createDemoPayment(input: CreateDemoPaymentInput): DemoPayment {
  const payment: DemoPayment = {
    id: nanoid(),
    debtorId: input.debtorId,
    reference: input.reference,
    amountCents: input.amountCents,
    currency: input.currency ?? "GBP",
    direction: input.direction ?? "incoming",
    source: input.source,
    externalId: input.externalId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  payments.set(payment.id, payment);
  return payment;
}

export function listDemoPayments(): DemoPayment[] {
  return [...payments.values()];
}

export function resetDemoPayments(): void {
  payments.clear();
}

export type SeedDemoResult = {
  expense: Expense;
  debtors: Debtor[];
};

export type SeedDemoInput = {
  amountsCents?: Partial<Record<"Dev" | "Lucia" | "Hamza", number>>;
};

/**
 * Resets all state then seeds the canonical Dishoom demo scenario.
 * Always resets first — calling seed twice produces one clean scenario.
 */
export function seedDemo(input: SeedDemoInput = {}): SeedDemoResult {
  resetDebtors();
  resetExpenses();
  resetDemoPayments();
  resetEvents();

  const devAmountCents = input.amountsCents?.Dev ?? 500;
  const luciaAmountCents = input.amountsCents?.Lucia ?? 100;
  const hamzaAmountCents = input.amountsCents?.Hamza ?? 100;

  const expense = createExpense({
    title: "Dinner at Dishoom",
    totalCents: devAmountCents + luciaAmountCents + hamzaAmountCents,
    currency: "GBP",
    paidBy: "Dev",
  });

  const created = [
    createDebtor({
      expenseId: expense.id,
      name: "Dev",
      phone: "+447700900111",
      amountCents: devAmountCents,
      paymentReference: "SAM-DISH-2",
    }),
    createDebtor({
      expenseId: expense.id,
      name: "Lucia",
      phone: "+447700900112",
      amountCents: luciaAmountCents,
      paymentReference: "LUCIA-DISH-1",
    }),
    createDebtor({
      expenseId: expense.id,
      name: "Hamza",
      phone: "+447700900113",
      amountCents: hamzaAmountCents,
      paymentReference: "HAMZA-DISH-1",
    }),
  ];

  return { expense, debtors: created };
}

/** @deprecated Use seedDemo() */
export function seedDemoDebtors(): Debtor[] {
  return seedDemo().debtors;
}
