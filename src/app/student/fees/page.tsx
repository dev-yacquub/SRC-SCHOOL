import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSchoolContext } from "@/lib/shell-context";
import {
  computeInvoiceItemBalances,
  formatCurrency,
  PAYMENT_METHOD_LABELS,
} from "@/lib/domain";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/ui";

export default async function StudentFeesPage() {
  const user = await requireRole(["STUDENT"]);
  const ctx = await getSchoolContext();

  const student = await prisma.student.findUnique({
    where: { userId: user.userId },
  });

  if (!student) {
    return <p className="text-sm text-slate-500">Student record not found.</p>;
  }

  const invoices = await prisma.invoice.findMany({
    where: { studentId: student.id, status: { not: "CANCELLED" } },
    include: {
      term: { select: { name: true } },
      items: {
        include: { allocations: true },
      },
      payments: {
        include: { allocations: true },
        orderBy: { paidAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalBilled = invoices.reduce((s, i) => s + i.totalCents, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paidCents, 0);
  const balance = Math.max(0, totalBilled - totalPaid);

  return (
    <div>
      <PageHeader
        title="My Fees & Receipts"
        subtitle="Term invoices, payments made, and remaining balance"
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Billed"
          value={formatCurrency(totalBilled, ctx.currencySymbol)}
          tone="indigo"
        />
        <StatCard
          label="Total Paid"
          value={formatCurrency(totalPaid, ctx.currencySymbol)}
          tone="emerald"
        />
        <StatCard
          label="Remaining Balance"
          value={formatCurrency(balance, ctx.currencySymbol)}
          tone={balance > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="space-y-6">
        {invoices.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">No invoices issued yet.</p>
          </Card>
        ) : (
          invoices.map((inv) => {
            const itemBalances = computeInvoiceItemBalances(inv);
            return (
            <Card
              key={inv.id}
              title={`${inv.invoiceNo} — ${inv.term.name}`}
              subtitle={
                inv.discountCents > 0
                  ? `Includes discount of ${formatCurrency(inv.discountCents, ctx.currencySymbol)} (${inv.discountReason ?? "Discount"})`
                  : undefined
              }
              action={<StatusBadge value={inv.status} />}
            >
              <div className="mb-4 grid gap-2 border-b border-slate-100 pb-4 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-slate-500">Total: </span>
                  <strong className="tabular-nums">
                    {formatCurrency(inv.totalCents, ctx.currencySymbol)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Paid: </span>
                  <strong className="text-emerald-700 tabular-nums">
                    {formatCurrency(inv.paidCents, ctx.currencySymbol)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Balance: </span>
                  <strong className="text-rose-700 tabular-nums">
                    {formatCurrency(
                      inv.totalCents - inv.paidCents,
                      ctx.currencySymbol
                    )}
                  </strong>
                </div>
              </div>

              {itemBalances.items.length > 0 && (
                <div className="mb-4">
                  <h4 className="mb-2 text-xs font-semibold text-slate-500 uppercase">
                    Fee Items
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {itemBalances.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-slate-800">
                          {it.name}
                        </span>
                        <span className="tabular-nums">
                          <strong className="text-slate-900">
                            {formatCurrency(it.amountCents, ctx.currencySymbol)}
                          </strong>
                          {it.allocatedPaidCents > 0 && (
                            <span className="ml-1.5 text-emerald-700">
                              (Paid{" "}
                              {formatCurrency(
                                it.allocatedPaidCents,
                                ctx.currencySymbol
                              )}
                              )
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {inv.payments.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold text-slate-500 uppercase">
                    Payments
                  </h4>
                  <div className="divide-y divide-slate-100">
                    {inv.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between py-2 text-sm"
                      >
                        <div>
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {p.receiptNo}
                          </span>{" "}
                          · {PAYMENT_METHOD_LABELS[p.method] ?? p.method} ·{" "}
                          <span className="text-xs text-slate-500">
                            {new Date(p.paidAt).toLocaleDateString()}
                          </span>
                          {p.allocations.length > 0 && (
                            <p className="mt-0.5 text-xs text-indigo-700">
                              Paid for:{" "}
                              {p.allocations
                                .map(
                                  (a) =>
                                    `${a.itemName} (${formatCurrency(a.amountCents, ctx.currencySymbol)})`
                                )
                                .join(" + ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-emerald-700 tabular-nums">
                            {formatCurrency(p.amountCents, ctx.currencySymbol)}
                          </span>
                          <Link
                            href={`/print/receipt/${p.id}`}
                            className="text-xs font-medium text-indigo-600 hover:underline"
                          >
                            Receipt
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

