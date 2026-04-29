import Link from "next/link";
import { getExpense } from "@/lib/store";
import { getDebtorByPaymentReference } from "@/lib/store";
import { PaymentForm } from "./PaymentForm";

type PayPageProps = {
  params: Promise<{
    reference: string;
  }>;
};

export default async function PayPage({ params }: PayPageProps) {
  const { reference } = await params;
  const debtor = getDebtorByPaymentReference(decodeURIComponent(reference));
  const expense = debtor ? getExpense(debtor.expenseId) : undefined;

  return (
    <main className="min-h-screen bg-[var(--pp-bg)] px-6 py-6 font-mono text-[var(--pp-text)]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--pp-border)] pb-4">
          <Link className="text-xs font-bold uppercase tracking-widest text-[var(--pp-lime)] hover:text-[var(--pp-green)]" href="/">
            Back to console
          </Link>
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--pp-text-dim)]">Reference {decodeURIComponent(reference)}</p>
        </div>

        {debtor ? (
          <PaymentForm debtor={debtor} expenseTitle={expense?.title ?? "Dinner at Dishoom"} />
        ) : (
          <section className="border border-[var(--pp-border)] bg-[var(--pp-panel)] p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--pp-red)]">Reference not found</p>
            <h1 className="mt-2 text-3xl font-bold">No debtor for {decodeURIComponent(reference)}</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--pp-text-muted)]">
              Seed the Dishoom demo on the console, then open this payment link again.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
