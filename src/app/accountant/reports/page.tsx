import React from "react";
import { prisma } from "@/lib/prisma";
import { getSchoolContext } from "@/lib/shell-context";
import { formatCurrency, PAYMENT_METHOD_LABELS } from "@/lib/domain";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { Download } from "lucide-react";

export default async function AccountantReportsPage() {
  const ctx = await getSchoolContext();

  const [classes, invoices, payments, expenses] = await Promise.all([
    prisma.schoolClass.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }] }),
    prisma.invoice.findMany({
      where: { status: { not: "CANCELLED" } },
      include: {
        student: {
          select: {
            fullName: true,
            admissionNo: true,
            guardianPhone: true,
            classId: true,
            class: { select: { name: true } },
          },
        },
      },
    }),
    prisma.payment.findMany({
      orderBy: { paidAt: "desc" },
    }),
    prisma.expense.aggregate({ _sum: { amountCents: true } }),
  ]);

  const totalCollected = payments.reduce((s, p) => s + p.amountCents, 0);
  const totalExpenses = expenses._sum.amountCents ?? 0;

  const byMethod = new Map<string, number>();
  const byDate = new Map<string, { count: number; totalCents: number }>();
  for (const p of payments) {
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amountCents);
    const day = new Date(p.paidAt).toISOString().slice(0, 10);
    const cur = byDate.get(day) ?? { count: 0, totalCents: 0 };
    byDate.set(day, { count: cur.count + 1, totalCents: cur.totalCents + p.amountCents });
  }

  const defaulters = invoices
    .filter((i) => i.totalCents > i.paidCents)
    .sort((a, b) => b.totalCents - b.paidCents - (a.totalCents - a.paidCents));

  return (
    <div>
      <PageHeader
        title="Financial Reports"
        subtitle="Collection by payment method, collection by class, and outstanding balances"
        action={
          <a
            href="/api/accountant/export?status=UNPAID"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            <Download className="h-4 w-4" />
            Export Outstanding (.xlsx)
          </a>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Fee Income"
          value={formatCurrency(totalCollected, ctx.currencySymbol)}
          tone="emerald"
        />
        <StatCard
          label="Total Expenses"
          value={formatCurrency(totalExpenses, ctx.currencySymbol)}
          tone="rose"
        />
        <StatCard
          label="Net Position"
          value={formatCurrency(totalCollected - totalExpenses, ctx.currencySymbol)}
          tone="indigo"
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Collection by Payment Method">
          <div className="space-y-2.5">
            {Array.from(byMethod.entries()).map(([method, amount]) => (
              <div
                key={method}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm"
              >
                <span className="font-medium text-slate-800">
                  {PAYMENT_METHOD_LABELS[method] ?? method}
                </span>
                <span className="font-bold text-emerald-700 tabular-nums">
                  {formatCurrency(amount, ctx.currencySymbol)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Collection by Class">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4 text-right">Billed</th>
                  <th className="py-2 pr-4 text-right">Collected</th>
                  <th className="py-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classes.map((c) => {
                  const clsInv = invoices.filter(
                    (i) => i.student.classId === c.id
                  );
                  const billed = clsInv.reduce((s, i) => s + i.totalCents, 0);
                  const paid = clsInv.reduce((s, i) => s + i.paidCents, 0);
                  return (
                    <tr key={c.id}>
                      <td className="py-2.5 pr-4 font-medium text-slate-900">
                        {c.name}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {formatCurrency(billed, ctx.currencySymbol)}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-emerald-700 tabular-nums">
                        {formatCurrency(paid, ctx.currencySymbol)}
                      </td>
                      <td className="py-2.5 text-right text-rose-700 tabular-nums">
                        {formatCurrency(billed - paid, ctx.currencySymbol)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Daily Collection Summary" className="mb-6">
        {byDate.size === 0 ? (
          <p className="text-sm text-slate-500">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4 text-right">Receipts</th>
                  <th className="py-2 text-right">Collected Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from(byDate.entries()).map(([day, info]) => (
                  <tr key={day}>
                    <td className="py-2.5 pr-4 font-medium text-slate-900 tabular-nums">
                      {day}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-slate-600 tabular-nums">
                      {info.count}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-emerald-700 tabular-nums">
                      {formatCurrency(info.totalCents, ctx.currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Outstanding Balances (${defaulters.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
              <tr>
                <th className="py-2 pr-4">Student</th>
                <th className="py-2 pr-4">Class</th>
                <th className="py-2 pr-4">Guardian Phone</th>
                <th className="py-2 text-right">Remaining Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {defaulters.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2.5 pr-4 font-medium text-slate-900">
                    {inv.student.fullName}{" "}
                    <span className="font-mono text-xs text-slate-400">
                      ({inv.student.admissionNo})
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600">
                    {inv.student.class.name}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-600">
                    {inv.student.guardianPhone}
                  </td>
                  <td className="py-2.5 text-right font-bold text-rose-700 tabular-nums">
                    {formatCurrency(
                      inv.totalCents - inv.paidCents,
                      ctx.currencySymbol
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

