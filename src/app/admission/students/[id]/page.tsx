import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSchoolContext } from "@/lib/shell-context";
import {
  calculateLetterGrade,
  formatCurrency,
  getLateArrivalStats,
  summarizeAttendance,
} from "@/lib/domain";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { StudentAccountActions } from "@/components/StudentAccountActions";
import { StudentLateReportCard } from "@/components/StudentLateReportCard";
import { Printer } from "lucide-react";

export default async function Student360ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["ADMISSION", "ADMIN"]);
  const { id } = await params;
  const ctx = await getSchoolContext();

  const [student, scales] = await Promise.all([
    prisma.student.findUnique({
      where: { id },
      include: {
        class: { include: { academicYear: { select: { name: true } } } },
        user: {
          select: {
            username: true,
            isActive: true,
            mustChangePassword: true,
            lastLoginAt: true,
          },
        },
        enrollments: {
          include: {
            class: { select: { name: true } },
            academicYear: { select: { name: true } },
          },
          orderBy: { enrolledAt: "desc" },
        },
        attendance: {
          orderBy: { date: "desc" },
        },
        lateArrivals: {
          orderBy: [{ date: "desc" }, { shift: "desc" }],
        },
        marks: {
          include: {
            exam: { include: { term: { select: { name: true } } } },
            subject: { select: { name: true } },
          },
          orderBy: [{ exam: { createdAt: "desc" } }, { subject: { name: "asc" } }],
        },
        invoices: {
          where: { status: { not: "CANCELLED" } },
          include: { term: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.gradeScale.findMany({ orderBy: { minScore: "desc" } }),
  ]);

  if (!student) notFound();

  const attSummary = summarizeAttendance(student.attendance);
  const lateStats = getLateArrivalStats(student.lateArrivals);
  const totalBilled = student.invoices.reduce((s, i) => s + i.totalCents, 0);
  const totalPaid = student.invoices.reduce((s, i) => s + i.paidCents, 0);
  const balance = totalBilled - totalPaid;

  // Group marks by exam
  const marksByExam = new Map<
    string,
    {
      examId: string;
      examName: string;
      termName: string;
      maxMarks: number;
      items: typeof student.marks;
    }
  >();
  for (const m of student.marks) {
    const existing = marksByExam.get(m.examId);
    if (existing) {
      existing.items.push(m);
    } else {
      marksByExam.set(m.examId, {
        examId: m.examId,
        examName: m.exam.name,
        termName: m.exam.term.name,
        maxMarks: m.exam.maxMarks,
        items: [m],
      });
    }
  }

  return (
    <div>
      <PageHeader
        title={student.fullName}
        subtitle={`${student.admissionNo} · ${student.class.name} (${student.class.academicYear.name})`}
        action={
          <>
            <Link
              href="/admission/students"
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ← Directory
            </Link>
            <Link
              href={`/print/student/${student.id}?doc=id-card`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              ID Card
            </Link>
            <Link
              href={`/print/student/${student.id}?doc=transfer-certificate`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Printer className="h-4 w-4" />
              Print Forms / Certificate
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Status"
          value={student.status}
          hint={student.statusReason ?? "Current enrollment status"}
          tone={student.status === "ACTIVE" ? "emerald" : "amber"}
        />
        <StatCard
          label="Attendance Rate"
          value={attSummary.total > 0 ? `${attSummary.ratePercent}%` : "—"}
          hint={`${attSummary.present}P · ${attSummary.absent}A`}
          tone="indigo"
        />
        <StatCard
          label="Late Days"
          value={lateStats.totalLateDays}
          hint={
            lateStats.totalLateShifts > 0
              ? `${lateStats.unpunishedLateDays} unpunished · ${lateStats.totalLateShifts} shifts`
              : "No late arrivals"
          }
          tone={
            lateStats.needsPunishmentHighlight
              ? "rose"
              : lateStats.unpunishedLateDays > 0
                ? "amber"
                : "emerald"
          }
        />
        <StatCard
          label="Exams Taken"
          value={marksByExam.size}
          hint={`${student.marks.length} subject grades`}
          tone="slate"
        />
        <StatCard
          label="Fee Balance"
          value={formatCurrency(balance, ctx.currencySymbol)}
          hint={`Billed ${formatCurrency(totalBilled, ctx.currencySymbol)} · Paid ${formatCurrency(totalPaid, ctx.currencySymbol)}`}
          tone={balance > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Student & Guardian Info" className="lg:col-span-2">
          <div className="flex flex-col gap-5 sm:flex-row">
            {student.photo ? (
              <img
                src={student.photo}
                alt={student.fullName}
                className="h-28 w-28 shrink-0 rounded-xl border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-3xl font-bold text-indigo-700">
                {student.fullName.charAt(0)}
              </div>
            )}
            <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Gender</dt>
                <dd className="font-medium text-slate-900">{student.gender}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Date of Birth</dt>
                <dd className="font-medium text-slate-900">
                  {student.dob ? new Date(student.dob).toLocaleDateString() : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Admission Date</dt>
                <dd className="font-medium text-slate-900">
                  {new Date(student.admissionDate).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Previous School</dt>
                <dd className="font-medium text-slate-900">
                  {student.previousSchool ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Guardian Name</dt>
                <dd className="font-medium text-slate-900">{student.guardianName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Guardian Phone</dt>
                <dd className="font-medium text-slate-900">{student.guardianPhone}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">Home Address</dt>
                <dd className="font-medium text-slate-900">{student.address ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">School Bus / Transport</dt>
                <dd className="font-medium text-slate-900">
                  {student.usesBus ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                      Uses School Bus
                      {student.busFeeCents && student.busFeeCents > 0
                        ? ` (${formatCurrency(student.busFeeCents, ctx.currencySymbol)} override)`
                        : " (Class standard bus fee)"}
                    </span>
                  ) : (
                    "No"
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card title="Student Portal Account">
          <StudentAccountActions
            studentId={student.id}
            username={student.user.username}
            initialActive={student.user.isActive}
            mustChangePassword={student.user.mustChangePassword}
          />
          {student.user.lastLoginAt && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              Last login: {new Date(student.user.lastLoginAt).toLocaleString()}
            </p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Class Enrollment History">
          {student.enrollments.length === 0 ? (
            <p className="text-sm text-slate-500">
              Current class: {student.class.name} ({student.class.academicYear.name})
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {student.enrollments.map((en) => (
                <div
                  key={en.id}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {en.class.name} · {en.academicYear.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(en.enrolledAt).toLocaleDateString()}
                      {en.note ? ` · ${en.note}` : ""}
                    </p>
                  </div>
                  <StatusBadge value={en.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent Attendance (Last 10 Records)">
          {student.attendance.length === 0 ? (
            <p className="text-sm text-slate-500">No attendance recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {student.attendance.slice(0, 10).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-700">{a.date}</span>
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                      {a.shift === "SHIFT_B" ? "Shift B" : "Shift A"}
                    </span>
                  </div>
                  <StatusBadge value={a.status === "ABSENT" ? "ABSENT" : "PRESENT"} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <StudentLateReportCard
        records={student.lateArrivals}
        showManageLink
        className="mt-6"
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Exam Results Summary">
          {marksByExam.size === 0 ? (
            <p className="text-sm text-slate-500">No exam marks recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {Array.from(marksByExam.values()).map((grp) => {
                const obtained = grp.items.reduce((s, m) => s + m.score, 0);
                const maxTotal = grp.items.length * grp.maxMarks;
                const overall = calculateLetterGrade(obtained, maxTotal, scales);
                return (
                  <div
                    key={grp.examId}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {grp.examName} ({grp.termName})
                      </p>
                      <p className="text-xs text-slate-500">
                        {grp.items.length} subjects · {overall.percentage}% · Grade{" "}
                        {overall.grade}
                      </p>
                    </div>
                    <Link
                      href={`/print/report-card/${student.id}/${grp.examId}`}
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Report Card PDF
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Fee Invoices Summary">
          {student.invoices.length === 0 ? (
            <p className="text-sm text-slate-500">No fee invoices generated.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {student.invoices.map((inv) => {
                const rem = inv.totalCents - inv.paidCents;
                return (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {inv.invoiceNo} · {inv.term.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Total {formatCurrency(inv.totalCents, ctx.currencySymbol)} · Due{" "}
                        {formatCurrency(rem, ctx.currencySymbol)}
                      </p>
                    </div>
                    <StatusBadge value={inv.status} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

