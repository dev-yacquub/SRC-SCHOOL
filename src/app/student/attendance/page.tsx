import React from "react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { summarizeAttendance } from "@/lib/domain";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/ui";

export default async function StudentAttendancePage() {
  const user = await requireRole(["STUDENT", "ADMIN"]);
  const student = await prisma.student.findUnique({
    where: { userId: user.userId },
  });

  const records = student
    ? await prisma.attendance.findMany({
        where: { studentId: student.id },
        orderBy: { date: "desc" },
      })
    : [];

  const summary = summarizeAttendance(records);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOffset = new Date(year, month, 1).getDay();

  const statusByDate = new Map(records.map((r) => [r.date, r.status]));
  const calendarCells: (number | null)[] = [
    ...Array(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const statusCellStyle: Record<string, string> = {
    PRESENT: "border-emerald-200 bg-emerald-50 text-emerald-800",
    LATE: "border-amber-200 bg-amber-50 text-amber-800",
    ABSENT: "border-rose-200 bg-rose-50 text-rose-800",
  };

  return (
    <div>
      <PageHeader
        title="My Attendance"
        subtitle="Your monthly attendance calendar, attendance rate, and daily log"
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Attendance Rate"
          value={summary.total > 0 ? `${summary.ratePercent}%` : "—"}
          tone="indigo"
        />
        <StatCard label="Present" value={summary.present} tone="emerald" />
        <StatCard label="Late" value={summary.late} tone="amber" />
        <StatCard label="Absent" value={summary.absent} tone="rose" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Monthly Calendar — ${monthName}`}>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1 font-semibold text-slate-400">
                {d}
              </div>
            ))}
            {calendarCells.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;
              const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const st = statusByDate.get(dateKey);
              return (
                <div
                  key={dateKey}
                  className={`rounded-lg border p-2 text-center ${
                    st
                      ? statusCellStyle[st]
                      : "border-slate-100 bg-slate-50/60 text-slate-500"
                  }`}
                >
                  <p className="font-semibold tabular-nums">{day}</p>
                  <p className="mt-0.5 text-[10px] font-medium">
                    {st ? st.slice(0, 1) : "—"}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            <span>P = Present</span>
            <span>L = Late</span>
            <span>A = Absent</span>
          </div>
        </Card>

        <Card title="Attendance Log">
          {records.length === 0 ? (
            <p className="text-sm text-slate-500">No attendance recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {records.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <div>
                    <span className="font-medium text-slate-900 tabular-nums">
                      {r.date}
                    </span>
                    {r.note && (
                      <span className="ml-3 text-xs text-slate-500">({r.note})</span>
                    )}
                  </div>
                  <StatusBadge value={r.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
