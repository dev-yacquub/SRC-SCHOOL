import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSchoolContext } from "@/lib/shell-context";
import {
  DAYS_OF_WEEK,
  formatCurrency,
  summarizeAttendance,
} from "@/lib/domain";
import { Card, PageHeader, StatCard } from "@/components/ui";

export default async function StudentDashboard() {
  const user = await requireRole(["STUDENT"]);
  const ctx = await getSchoolContext();

  const student = await prisma.student.findUnique({
    where: { userId: user.userId },
    include: { class: true },
  });

  if (!student) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Student record not found. Contact Admission Office.
      </div>
    );
  }

  const todayDay = new Date().getDay();

  const [attendance, invoices, publishedExams, todaySlots] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId: student.id },
      select: { status: true },
    }),
    prisma.invoice.findMany({
      where: { studentId: student.id, status: { not: "CANCELLED" } },
      select: { totalCents: true, paidCents: true },
    }),
    prisma.exam.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: "desc" },
      take: 1,
      include: {
        marks: { where: { studentId: student.id } },
      },
    }),
    prisma.timetableSlot.findMany({
      where: {
        dayOfWeek: todayDay,
        classSubject: { classId: student.classId },
      },
      include: {
        classSubject: {
          include: {
            subject: { select: { name: true } },
            teacher: { select: { fullName: true } },
          },
        },
      },
      orderBy: { period: "asc" },
    }),
  ]);

  const att = summarizeAttendance(attendance);
  const balanceCents = invoices.reduce(
    (sum, i) => sum + (i.totalCents - i.paidCents),
    0
  );
  const latestExam = publishedExams[0];
  const latestAvg =
    latestExam && latestExam.marks.length > 0
      ? Math.round(
          (latestExam.marks.reduce((s, m) => s + m.score, 0) /
            latestExam.marks.length /
            latestExam.maxMarks) *
            1000
        ) / 10
      : null;

  const todayLabel =
    DAYS_OF_WEEK.find((d) => d.value === todayDay)?.label ?? "Today";

  return (
    <div>
      <PageHeader
        title={`Hello, ${student.fullName}`}
        subtitle={`${student.class.name} · Admission No: ${student.admissionNo}`}
        action={
          <Link
            href="/student/results"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            View Report Card
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Current Class" value={student.class.name} tone="indigo" />
        <StatCard
          label="Attendance"
          value={att.total > 0 ? `${att.ratePercent}%` : "—"}
          hint={`${att.present} present · ${att.absent} absent`}
          tone="emerald"
        />
        <StatCard
          label="Latest Published Avg"
          value={latestAvg !== null ? `${latestAvg}%` : "Pending"}
          hint={latestExam ? latestExam.name : "No published exam"}
          tone="slate"
        />
        <StatCard
          label="Fee Balance Due"
          value={formatCurrency(balanceCents, ctx.currencySymbol)}
          tone={balanceCents > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Today's Timetable (${todayLabel})`}>
          {todaySlots.length === 0 ? (
            <p className="text-sm text-slate-500">
              No lessons scheduled for {todayLabel}.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {todaySlots.map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {slot.classSubject.subject.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Period {slot.period} · {slot.classSubject.teacher.fullName}
                    </p>
                  </div>
                  <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 tabular-nums">
                    {slot.startTime}–{slot.endTime}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Quick Links">
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/student/attendance"
              className="rounded-lg border border-slate-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <p className="font-semibold text-slate-900">My Attendance</p>
              <p className="mt-1 text-xs text-slate-500">
                Daily attendance log & rate
              </p>
            </Link>
            <Link
              href="/student/results"
              className="rounded-lg border border-slate-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <p className="font-semibold text-slate-900">My Results</p>
              <p className="mt-1 text-xs text-slate-500">
                Marks & printable report card
              </p>
            </Link>
            <Link
              href="/student/fees"
              className="rounded-lg border border-slate-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <p className="font-semibold text-slate-900">My Fees</p>
              <p className="mt-1 text-xs text-slate-500">
                Invoices, receipts & balance
              </p>
            </Link>
            <Link
              href="/student/profile"
              className="rounded-lg border border-slate-200 p-4 hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <p className="font-semibold text-slate-900">My Profile</p>
              <p className="mt-1 text-xs text-slate-500">
                Personal & guardian info
              </p>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

