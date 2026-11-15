import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { calculateLetterGrade, summarizeAttendance } from "@/lib/domain";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { ArrowLeft, Printer } from "lucide-react";

export default async function TeacherStudentAcademicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(["TEACHER", "ADMIN"]);
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;

  const [student, scales, reportRemarks] = await Promise.all([
    prisma.student.findUnique({
      where: { id },
      include: {
        class: { include: { academicYear: { select: { name: true } } } },
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
        marks: {
          include: {
            exam: { include: { term: { select: { name: true } } } },
            subject: { select: { id: true, name: true, code: true } },
          },
          orderBy: [{ exam: { createdAt: "desc" } }, { subject: { name: "asc" } }],
        },
      },
    }),
    prisma.gradeScale.findMany({ orderBy: { minScore: "desc" } }),
    prisma.reportRemark.findMany({ where: { studentId: id } }),
  ]);

  if (!student) notFound();

  if (!isAdmin) {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.userId },
    });
    const assigned = teacher
      ? await prisma.classSubject.findFirst({
          where: { teacherId: teacher.id, classId: student.classId },
        })
      : null;

    if (!assigned) {
      return (
        <div>
          <PageHeader
            title="Access Restricted"
            action={
              <Link
                href="/teacher/students"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to My Students
              </Link>
            }
          />
          <Card>
            <p className="text-sm text-slate-600">
              You can only view academic profiles of students currently enrolled in your
              assigned classes.
            </p>
          </Card>
        </div>
      );
    }
  }

  const attSummary = summarizeAttendance(student.attendance);
  const remarkByExam = new Map(reportRemarks.map((r) => [r.examId, r]));

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
              href="/teacher/students"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Roster
            </Link>
            <Link
              href={`/teacher/results?classId=${student.classId}`}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Class Broadsheet
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Attendance Rate"
          value={attSummary.total > 0 ? `${attSummary.ratePercent}%` : "N/A"}
          hint={`${attSummary.present} Present · ${attSummary.late} Late · ${attSummary.absent} Absent`}
          tone={attSummary.ratePercent >= 80 || attSummary.total === 0 ? "emerald" : "rose"}
        />
        <StatCard
          label="Attendance Days"
          value={attSummary.total}
          hint="Recorded daily roll calls"
          tone="slate"
        />
        <StatCard
          label="Exams Recorded"
          value={marksByExam.size}
          hint={`${student.marks.length} subject mark entries`}
          tone="indigo"
        />
        <StatCard
          label="Current Status"
          value={student.status}
          hint={student.class.name}
          tone="slate"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Student & Guardian Contact" className="lg:col-span-2">
          <div className="flex flex-wrap items-start gap-6">
            {student.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={student.photo}
                alt={student.fullName}
                className="h-24 w-24 rounded-xl border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-slate-200 bg-indigo-50 text-2xl font-bold text-indigo-700">
                {student.fullName.charAt(0).toUpperCase()}
              </div>
            )}

            <dl className="grid flex-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Admission Number</dt>
                <dd className="font-mono font-semibold text-slate-900">
                  {student.admissionNo}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Gender</dt>
                <dd className="font-medium text-slate-900">{student.gender}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Date of Birth</dt>
                <dd className="text-slate-800">
                  {student.dob
                    ? new Date(student.dob).toLocaleDateString()
                    : "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Admission Date</dt>
                <dd className="text-slate-800">
                  {new Date(student.admissionDate).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Guardian Name</dt>
                <dd className="font-medium text-slate-900">{student.guardianName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Guardian Phone</dt>
                <dd className="font-medium text-slate-900">
                  <a
                    href={`tel:${student.guardianPhone}`}
                    className="text-indigo-600 hover:underline"
                  >
                    {student.guardianPhone}
                  </a>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Address</dt>
                <dd className="text-slate-800">{student.address || "Not recorded"}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card title="Recent Attendance (Last 12)">
          {student.attendance.length === 0 ? (
            <p className="text-sm text-slate-500">No attendance records yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {student.attendance.slice(0, 12).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <span className="font-mono text-xs text-slate-700">{a.date}</span>
                    {a.note && (
                      <span className="ml-2 text-xs text-slate-500">({a.note})</span>
                    )}
                  </div>
                  <StatusBadge value={a.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 space-y-6">
        <Card title="Academic Performance & Report Cards">
          {marksByExam.size === 0 ? (
            <p className="text-sm text-slate-500">No exam marks recorded yet.</p>
          ) : (
            <div className="space-y-6">
              {Array.from(marksByExam.values()).map((grp) => {
                const obtained = grp.items.reduce((s, m) => s + m.score, 0);
                const totalMax = grp.items.length * grp.maxMarks;
                const overall = calculateLetterGrade(obtained, totalMax, scales);
                const rem = remarkByExam.get(grp.examId);

                return (
                  <div
                    key={grp.examId}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          {grp.examName} ({grp.termName})
                        </h3>
                        <p className="text-xs text-slate-500">
                          Total: {obtained}/{totalMax} · Overall:{" "}
                          <strong className="text-slate-800">{overall.percentage}%</strong> ·
                          Grade <strong className="text-indigo-700">{overall.grade}</strong>
                        </p>
                      </div>
                      <Link
                        href={`/print/report-card/${student.id}/${grp.examId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print Report Card
                      </Link>
                    </div>

                    {/* Mobile Subject Scores */}
                    <div className="space-y-2 sm:hidden">
                      {grp.items.map((m) => {
                        const g = calculateLetterGrade(
                          m.score,
                          grp.maxMarks,
                          scales
                        );
                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">
                                {m.subject.name}{" "}
                                <span className="text-xs text-slate-400">
                                  ({m.subject.code})
                                </span>
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {m.remark || g.remark || "—"}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="font-semibold text-slate-900 tabular-nums">
                                {m.score}/{grp.maxMarks}
                              </p>
                              <p className="text-xs font-bold text-indigo-700 tabular-nums">
                                {g.percentage}% · {g.grade}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                          <tr>
                            <th className="py-2 pr-4">Subject</th>
                            <th className="py-2 pr-4 text-right">Score</th>
                            <th className="py-2 pr-4 text-right">%</th>
                            <th className="py-2 pr-4 text-center">Grade</th>
                            <th className="py-2">Teacher Remark</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {grp.items.map((m) => {
                            const g = calculateLetterGrade(
                              m.score,
                              grp.maxMarks,
                              scales
                            );
                            return (
                              <tr key={m.id}>
                                <td className="py-2 pr-4 font-medium text-slate-900">
                                  {m.subject.name}{" "}
                                  <span className="text-xs text-slate-400">
                                    ({m.subject.code})
                                  </span>
                                </td>
                                <td className="py-2 pr-4 text-right tabular-nums">
                                  {m.score} / {grp.maxMarks}
                                </td>
                                <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                                  {g.percentage}%
                                </td>
                                <td className="py-2 pr-4 text-center font-bold text-indigo-700">
                                  {g.grade}
                                </td>
                                <td className="py-2 text-xs text-slate-600">
                                  {m.remark || g.remark || "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {(rem?.teacherRemark || rem?.principalRemark) && (
                      <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
                        {rem.teacherRemark && (
                          <div>
                            <span className="font-semibold text-slate-600">
                              Class Teacher Remark:
                            </span>{" "}
                            <span className="text-slate-800">{rem.teacherRemark}</span>
                          </div>
                        )}
                        {rem.principalRemark && (
                          <div>
                            <span className="font-semibold text-slate-600">
                              Principal Remark:
                            </span>{" "}
                            <span className="text-slate-800">{rem.principalRemark}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {student.enrollments.length > 0 && (
          <Card title="Class Enrollment History">
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
          </Card>
        )}
      </div>
    </div>
  );
}

