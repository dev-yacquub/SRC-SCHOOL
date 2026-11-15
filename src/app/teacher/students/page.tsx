import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { summarizeAttendance } from "@/lib/domain";
import { Card, PageHeader } from "@/components/ui";

export default async function TeacherStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; examId?: string; q?: string }>;
}) {
  const user = await requireRole(["TEACHER", "ADMIN"]);
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const classIdParam = sp.classId ?? "";
  const examIdParam = sp.examId ?? "";
  const q = sp.q?.trim() ?? "";

  let classes: { id: string; name: string; level: number }[] = [];

  if (isAdmin) {
    classes = await prisma.schoolClass.findMany({
      orderBy: [{ level: "asc" }, { name: "asc" }],
      select: { id: true, name: true, level: true },
    });
  } else {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.userId },
    });
    if (teacher) {
      const assignments = await prisma.classSubject.findMany({
        where: { teacherId: teacher.id },
        include: { class: { select: { id: true, name: true, level: true } } },
        orderBy: [{ class: { level: "asc" } }, { class: { name: "asc" } }],
      });
      classes = Array.from(
        new Map(assignments.map((a) => [a.class.id, a.class])).values()
      );
    }
  }

  const allowedClassIds = classes.map((c) => c.id);
  const selectedClassId = allowedClassIds.includes(classIdParam)
    ? classIdParam
    : "";

  const [exams, students] = await Promise.all([
    prisma.exam.findMany({
      include: { term: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    allowedClassIds.length > 0
      ? prisma.student.findMany({
        where: {
          status: "ACTIVE",
          classId: selectedClassId ? selectedClassId : { in: allowedClassIds },
          ...(q
            ? {
              OR: [
                { fullName: { contains: q } },
                { admissionNo: { contains: q } },
                { guardianName: { contains: q } },
                { guardianPhone: { contains: q } },
              ],
            }
            : {}),
        },
        include: {
          class: { select: { id: true, name: true, level: true } },
          attendance: { select: { status: true } },
        },
        orderBy: [{ class: { level: "asc" } }, { fullName: "asc" }],
      })
      : [],
  ]);

  const selectedExam = exams.find((e) => e.id === examIdParam) ?? exams[0] ?? null;

  return (
    <div>
      <PageHeader
        title="My Class Students"
        subtitle="Active student roster across your assigned classes with attendance overview and academic profiles"
        action={
          selectedClassId || classes[0]?.id ? (
            <Link
              href={`/teacher/results?classId=${selectedClassId || classes[0].id}${selectedExam ? `&examId=${selectedExam.id}` : ""
                }`}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Class Broadsheet
            </Link>
          ) : undefined
        }
      />

      <Card>
        <form
          method="GET"
          className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between"
        >
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Class
              </label>
              <select
                name="classId"
                defaultValue={selectedClassId}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
              >
                <option value="">All Assigned Classes ({classes.length})</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {exams.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Report Card Exam
                </label>
                <select
                  name="examId"
                  defaultValue={selectedExam?.id ?? ""}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} ({ex.term.name})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Search Student / Guardian
              </label>
              <input
                name="q"
                defaultValue={q}
                placeholder="Name, Adm No, or Phone..."
                className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-60 sm:text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="min-h-[42px] flex-1 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:flex-initial"
              >
                Apply
              </button>
              {(selectedClassId || q || examIdParam) && (
                <Link
                  href="/teacher/students"
                  className="inline-flex min-h-[42px] items-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </Link>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Showing <strong className="text-slate-800">{students.length}</strong> active
            student{students.length === 1 ? "" : "s"}
          </p>
        </form>

        {classes.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            You do not have any assigned classes yet.
          </p>
        ) : students.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No active students matched your filter criteria.
          </p>
        ) : (
          <>
            {/* Mobile Student Cards */}
            <div className="space-y-3 md:hidden">
              {students.map((s) => {
                const att = summarizeAttendance(s.attendance);
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {s.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.photo}
                            alt={s.fullName}
                            className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                            {s.fullName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <Link
                            href={`/teacher/students/${s.id}`}
                            className="block truncate font-semibold text-slate-900 hover:text-indigo-600"
                          >
                            {s.fullName}
                          </Link>
                          <p className="truncate text-xs text-slate-500">
                            <span className="font-mono">{s.admissionNo}</span> · {s.class.name} ·{" "}
                            {s.gender}
                          </p>
                        </div>
                      </div>
                      {att.total === 0 ? (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                          No logs
                        </span>
                      ) : (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                            att.ratePercent >= 80
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {att.ratePercent}% Att
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <span className="truncate text-slate-600">
                        Guardian: <strong className="text-slate-800">{s.guardianName}</strong>
                      </span>
                      <a
                        href={`tel:${s.guardianPhone}`}
                        className="shrink-0 font-semibold text-indigo-600 hover:underline"
                      >
                        Call {s.guardianPhone}
                      </a>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <Link
                        href={`/teacher/students/${s.id}`}
                        className="inline-flex min-h-[38px] items-center justify-center rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        Academic Profile
                      </Link>
                      {selectedExam && (
                        <Link
                          href={`/print/report-card/${s.id}/${selectedExam.id}`}
                          className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Report Card
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Student Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2.5 pr-4">Student</th>
                    <th className="py-2.5 pr-4">Adm No</th>
                    <th className="py-2.5 pr-4">Class</th>
                    <th className="py-2.5 pr-4">Guardian Contact</th>
                    <th className="py-2.5 pr-4">Attendance</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => {
                    const att = summarizeAttendance(s.attendance);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2.5">
                            {s.photo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={s.photo}
                                alt={s.fullName}
                                className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                                {s.fullName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <Link
                                href={`/teacher/students/${s.id}`}
                                className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                              >
                                {s.fullName}
                              </Link>
                              <p className="text-[11px] text-slate-400">{s.gender}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">
                          {s.admissionNo}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-700">{s.class.name}</td>
                        <td className="py-2.5 pr-4 text-slate-600">
                          <div>{s.guardianName}</div>
                          <div className="text-xs text-slate-400">{s.guardianPhone}</div>
                        </td>
                        <td className="py-2.5 pr-4">
                          {att.total === 0 ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
                              No logs
                            </span>
                          ) : (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${att.ratePercent >= 80
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700"
                                }`}
                            >
                              {att.ratePercent}% ({att.present}/{att.total})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-3">
                            <Link
                              href={`/teacher/students/${s.id}`}
                              className="text-xs font-medium text-indigo-600 hover:underline"
                            >
                              Academic Profile
                            </Link>
                            {selectedExam && (
                              <Link
                                href={`/print/report-card/${s.id}/${selectedExam.id}`}
                                className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
                              >
                                Report Card
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
