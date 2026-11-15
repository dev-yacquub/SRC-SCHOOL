import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSchoolContext } from "@/lib/shell-context";
import { formatCurrency, summarizeAttendance } from "@/lib/domain";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/ui";

export default async function AdminDashboard() {
  const ctx = await getSchoolContext();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [
    activeStudents,
    activeTeachers,
    todayAttendance,
    invoiceTotals,
    exams,
    recentLogs,
  ] = await Promise.all([
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.teacher.count({ where: { user: { isActive: true } } }),
    prisma.attendance.findMany({
      where: { date: todayStr },
      select: { status: true },
    }),
    prisma.invoice.aggregate({
      where: { status: { not: "CANCELLED" } },
      _sum: { totalCents: true, paidCents: true },
    }),
    prisma.exam.findMany({
      include: { term: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.auditLog.findMany({
      include: { user: { select: { fullName: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const attSummary = summarizeAttendance(todayAttendance);
  const billed = invoiceTotals._sum.totalCents ?? 0;
  const collected = invoiceTotals._sum.paidCents ?? 0;
  const outstanding = Math.max(0, billed - collected);

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        subtitle={`Overview for ${ctx.schoolName}${ctx.academicLabel ? ` (${ctx.academicLabel})` : ""}`}
        action={
          <>
            <Link
              href="/admin/users"
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Manage Users
            </Link>
            <Link
              href="/admin/exams"
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Exams & Results
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Students"
          value={activeStudents}
          hint="Currently enrolled"
          tone="indigo"
        />
        <StatCard
          label="Active Teachers"
          value={activeTeachers}
          hint="Teaching staff"
          tone="slate"
        />
        <StatCard
          label="Today's Attendance"
          value={attSummary.total > 0 ? `${attSummary.ratePercent}%` : "No marks"}
          hint={`${attSummary.present} present, ${attSummary.absent} absent`}
          tone="emerald"
        />
        <StatCard
          label="Fees Collected"
          value={formatCurrency(collected, ctx.currencySymbol)}
          hint={`${formatCurrency(outstanding, ctx.currencySymbol)} outstanding`}
          tone="amber"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Exams Status"
          action={
            <Link
              href="/admin/exams"
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              Manage
            </Link>
          }
        >
          {exams.length === 0 ? (
            <p className="text-sm text-slate-500">No exams created yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {exams.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{ex.name}</p>
                    <p className="text-xs text-slate-500">
                      {ex.term.name} · Max {ex.maxMarks}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ex.isLocked && <StatusBadge value="LOCKED" />}
                    <StatusBadge value={ex.isPublished ? "PUBLISHED" : "DRAFT"} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent System Activity">
          {recentLogs.length === 0 ? (
            <p className="text-sm text-slate-500">No audit activity yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {log.action.replaceAll("_", " ")}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      By {log.user.fullName} ({log.user.role})
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(log.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

