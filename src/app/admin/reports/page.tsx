import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSchoolContext } from "@/lib/shell-context";
import { formatCurrency, summarizeAttendance } from "@/lib/domain";
import { Card, PageHeader, StatCard } from "@/components/ui";

export default async function AdminReportsPage() {
  const ctx = await getSchoolContext();

  const [classes, allAttendance, invoices, expenses, students] = await Promise.all([
    prisma.schoolClass.findMany({
      orderBy: [{ level: "asc" }, { name: "asc" }],
      include: {
        students: { where: { status: "ACTIVE" }, select: { id: true } },
      },
    }),
    prisma.attendance.findMany({
      select: { classId: true, status: true },
    }),
    prisma.invoice.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { student: { select: { classId: true } } },
    }),
    prisma.expense.aggregate({ _sum: { amountCents: true } }),
    prisma.student.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const totalBilled = invoices.reduce((s, i) => s + i.totalCents, 0);
  const totalCollected = invoices.reduce((s, i) => s + i.paidCents, 0);
  const totalExpenses = expenses._sum.amountCents ?? 0;

  return (
    <div>
      <PageHeader
        title="School Reports"
        subtitle="Enrollment, attendance, and fee collection breakdown by class"
        action={
          <Link
            href="/admission/students"
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            View Student Directory
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Billed"
          value={formatCurrency(totalBilled, ctx.currencySymbol)}
          tone="indigo"
        />
        <StatCard
          label="Fees Collected"
          value={formatCurrency(totalCollected, ctx.currencySymbol)}
          tone="emerald"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(totalBilled - totalCollected, ctx.currencySymbol)}
          tone="rose"
        />
        <StatCard
          label="Recorded Expenses"
          value={formatCurrency(totalExpenses, ctx.currencySymbol)}
          tone="slate"
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card title="Class-by-Class Summary" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4 text-right">Active Students</th>
                  <th className="py-2 pr-4 text-right">Attendance Rate</th>
                  <th className="py-2 pr-4 text-right">Billed</th>
                  <th className="py-2 text-right">Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {classes.map((c) => {
                  const classAtt = allAttendance.filter((a) => a.classId === c.id);
                  const attSum = summarizeAttendance(classAtt);
                  const classInv = invoices.filter(
                    (inv) => inv.student.classId === c.id
                  );
                  const billed = classInv.reduce((s, i) => s + i.totalCents, 0);
                  const paid = classInv.reduce((s, i) => s + i.paidCents, 0);

                  return (
                    <tr key={c.id}>
                      <td className="py-2.5 pr-4 font-medium text-slate-900">
                        {c.name}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {c.students.length}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {attSum.total > 0 ? `${attSum.ratePercent}%` : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {formatCurrency(billed, ctx.currencySymbol)}
                      </td>
                      <td className="py-2.5 text-right font-medium text-emerald-700 tabular-nums">
                        {formatCurrency(paid, ctx.currencySymbol)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Students by Status">
          <div className="space-y-3">
            {students.map((g) => (
              <div
                key={g.status}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm"
              >
                <span className="font-medium text-slate-700">{g.status}</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  {g._count._all}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

