import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSchoolContext } from "@/lib/shell-context";
import { formatCurrency, PAYMENT_METHOD_LABELS } from "@/lib/domain";
import { Card, PageHeader, StatCard } from "@/components/ui";

export default async function AccountantDashboard() {
  const ctx = await getSchoolContext();

  const [invoiceAgg, expenseAgg, recentPayments, unpaidCount] =
    await Promise.all([
      prisma.invoice.aggregate({
        where: { status: { not: "CANCELLED" } },
        _sum: { totalCents: true, paidCents: true },
      }),
      prisma.expense.aggregate({ _sum: { amountCents: true } }),
      prisma.payment.findMany({
        include: {
          invoice: {
            include: {
              student: {
                select: {
                  admissionNo: true,
                  fullName: true,
                  class: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { paidAt: "desc" },
        take: 8,
      }),
      prisma.invoice.count({ where: { status: { in: ["UNPAID", "PARTIAL"] } } }),
    ]);

  const billed = invoiceAgg._sum.totalCents ?? 0;
  const collected = invoiceAgg._sum.paidCents ?? 0;
  const outstanding = Math.max(0, billed - collected);
  const expenses = expenseAgg._sum.amountCents ?? 0;

  return (
    <div>
      <PageHeader
        title="Accountant Dashboard"
        subtitle="Manage fee structures, billing, payments, receipts, and school expenses"
        action={
          <>
            <Link
              href="/accountant/invoices"
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Generate Invoices
            </Link>
            <Link
              href="/accountant/payments"
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Record Payment
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Billed"
          value={formatCurrency(billed, ctx.currencySymbol)}
          tone="indigo"
        />
        <StatCard
          label="Total Collected"
          value={formatCurrency(collected, ctx.currencySymbol)}
          tone="emerald"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(outstanding, ctx.currencySymbol)}
          hint={`${unpaidCount} unpaid/partial invoices`}
          tone="rose"
        />
        <StatCard
          label="Net (Collected - Expenses)"
          value={formatCurrency(collected - expenses, ctx.currencySymbol)}
          hint={`Expenses: ${formatCurrency(expenses, ctx.currencySymbol)}`}
          tone="slate"
        />
      </div>

      <Card
        title="Recent Fee Payments"
        action={
          <Link
            href="/accountant/payments"
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            Record Payment
          </Link>
        }
      >
        {recentPayments.length === 0 ? (
          <p className="text-sm text-slate-500">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-4">Receipt</th>
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 text-right">Print</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">
                      {p.receiptNo}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-slate-900">
                      {p.invoice.student.fullName}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">
                      {p.invoice.student.class.name}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">
                      {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-semibold text-emerald-700 tabular-nums">
                      {formatCurrency(p.amountCents, ctx.currencySymbol)}
                    </td>
                    <td className="py-2.5 text-right">
                      <Link
                        href={`/print/receipt/${p.id}`}
                        className="text-xs font-medium text-indigo-600 hover:underline"
                      >
                        Receipt
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

