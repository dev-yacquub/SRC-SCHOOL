import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { DAYS_OF_WEEK, summarizeAttendance } from "@/lib/domain";
import { Card, PageHeader, StatCard } from "@/components/ui";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  Users,
} from "lucide-react";

export default async function TeacherDashboard() {
  const user = await requireRole(["TEACHER", "ADMIN"]);
  const isAdmin = user.role === "ADMIN";

  const teacher = isAdmin
    ? null
    : await prisma.teacher.findUnique({ where: { userId: user.userId } });

  if (!isAdmin && !teacher) {
    return (
      <div>
        <PageHeader title="Teacher Portal" />
        <Card>
          <p className="text-sm text-slate-600">
            Your teacher profile has not been linked yet. Please contact the school administrator.
          </p>
        </Card>
      </div>
    );
  }

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const dayOfWeek = today.getDay();
  const todayDayLabel =
    DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label ?? "Weekend / Holiday";

  const assignments = await prisma.classSubject.findMany({
    where: teacher ? { teacherId: teacher.id } : undefined,
    include: {
      class: { select: { id: true, name: true, level: true } },
      subject: { select: { id: true, name: true, code: true } },
      teacher: { select: { id: true, fullName: true } },
    },
    orderBy: [{ class: { level: "asc" } }, { class: { name: "asc" } }, { subject: { name: "asc" } }],
  });

  const uniqueClasses = Array.from(
    new Map(assignments.map((a) => [a.class.id, a.class])).values()
  );
  const assignedClassIds = uniqueClasses.map((c) => c.id);

  const [studentCounts, todayLessons, todayAttendance, preferredExams] =
    await Promise.all([
      assignedClassIds.length > 0
        ? prisma.student.groupBy({
          by: ["classId"],
          where: { classId: { in: assignedClassIds }, status: "ACTIVE" },
          _count: { _all: true },
        })
        : [],
      prisma.timetableSlot.findMany({
        where: {
          dayOfWeek,
          ...(teacher ? { classSubject: { teacherId: teacher.id } } : {}),
        },
        include: {
          classSubject: {
            include: {
              class: { select: { id: true, name: true } },
              subject: { select: { id: true, name: true } },
              teacher: { select: { fullName: true } },
            },
          },
        },
        orderBy: [{ period: "asc" }, { classSubject: { class: { level: "asc" } } }],
      }),
      assignedClassIds.length > 0
        ? prisma.attendance.findMany({
          where: { classId: { in: assignedClassIds }, date: todayIso },
          select: { classId: true, shift: true, status: true },
        })
        : [],
      prisma.exam.findMany({
        include: { term: { select: { name: true } } },
        orderBy: [{ isLocked: "asc" }, { createdAt: "desc" }],
        take: 1,
      }),
    ]);

  const activeExam = preferredExams[0] ?? null;
  const marksCounts =
    activeExam && assignedClassIds.length > 0
      ? await prisma.mark.groupBy({
        by: ["classId", "subjectId"],
        where: { examId: activeExam.id, classId: { in: assignedClassIds } },
        _count: { _all: true },
      })
      : [];

  const studentCountByClass = new Map<string, number>(
    studentCounts.map((c) => [c.classId, c._count._all])
  );
  const totalStudents = Array.from(studentCountByClass.values()).reduce(
    (sum, c) => sum + c,
    0
  );

  type ShiftStats = { present: number; absent: number; total: number };
  const attendanceByClass = new Map<
    string,
    {
      present: number;
      absent: number;
      total: number;
      SHIFT_A?: ShiftStats;
      SHIFT_B?: ShiftStats;
    }
  >();
  for (const row of todayAttendance) {
    const cur = attendanceByClass.get(row.classId) ?? {
      present: 0,
      absent: 0,
      total: 0,
    };
    cur.total += 1;
    if (row.status === "ABSENT") cur.absent += 1;
    else cur.present += 1;

    const shiftKey = row.shift === "SHIFT_B" ? "SHIFT_B" : "SHIFT_A";
    const sCur = cur[shiftKey] ?? { present: 0, absent: 0, total: 0 };
    sCur.total += 1;
    if (row.status === "ABSENT") sCur.absent += 1;
    else sCur.present += 1;
    cur[shiftKey] = sCur;

    attendanceByClass.set(row.classId, cur);
  }

  const classesMarkedToday = attendanceByClass.size;
  const todayAttSummary = summarizeAttendance(todayAttendance);

  const markCountMap = new Map<string, number>(
    marksCounts.map((m) => [`${m.classId}:${m.subjectId}`, m._count._all])
  );

  return (
    <div>
      <PageHeader
        title={teacher ? `Welcome, ${teacher.fullName}` : "Teacher Portal Overview"}
        subtitle={
          teacher
            ? `${teacher.qualification || "Academic Faculty"}${
                teacher.phone ? ` · ${teacher.phone}` : ""
              }`
            : "Administrator view across all teaching classes, roll calls, and gradebooks"
        }
        action={
          <>
            <Link
              href="/teacher/attendance"
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:flex-initial"
            >
              <ClipboardCheck className="h-4 w-4" />
              Take Attendance
            </Link>
            <Link
              href="/teacher/marks"
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:flex-initial"
            >
              <BookOpen className="h-4 w-4" />
              Enter Marks
            </Link>
            <Link
              href="/teacher/results"
              className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 sm:w-auto"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Class Broadsheet
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Assigned Classes"
          value={uniqueClasses.length}
          hint={`${totalStudents} active students`}
          tone="indigo"
        />
        <StatCard
          label="Assigned Subjects"
          value={assignments.length}
          hint={
            teacher
              ? teacher.qualification || "Teaching assignments"
              : "All active class subjects"
          }
          tone="slate"
        />
        <StatCard
          label="Today's Lessons"
          value={todayLessons.length}
          hint={`${todayDayLabel} · ${todayIso}`}
          tone="indigo"
        />
        <StatCard
          label="Today's Attendance"
          value={`${classesMarkedToday} / ${uniqueClasses.length}`}
          hint={
            todayAttendance.length > 0
              ? `${todayAttSummary.ratePercent}% present across marked classes`
              : "No roll call submitted yet today"
          }
          tone={
            uniqueClasses.length > 0 && classesMarkedToday === uniqueClasses.length
              ? "emerald"
              : "amber"
          }
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card
          title={`Today's Lessons (${todayDayLabel})`}
          action={
            <Link
              href="/teacher/timetable"
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              <Calendar className="h-3.5 w-3.5" />
              Full Timetable
            </Link>
          }
        >
          {todayLessons.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No scheduled lessons for {todayDayLabel}.
            </div>
          ) : (
            <div className="space-y-2.5">
              {todayLessons.map((slot) => (
                <div
                  key={slot.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-700">
                      P{slot.period}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {slot.classSubject.subject.name} · {slot.classSubject.class.name}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-slate-500 tabular-nums">
                        <Clock className="h-3 w-3" />
                        {slot.startTime} – {slot.endTime}
                        {isAdmin && (
                          <span className="text-slate-400">
                            · {slot.classSubject.teacher.fullName}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/teacher/attendance?classId=${slot.classSubject.classId}&date=${todayIso}`}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Roll Call →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Today's Attendance Status"
          action={
            <Link
              href="/teacher/students"
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              <Users className="h-3.5 w-3.5" />
              Class Roster
            </Link>
          }
        >
          {uniqueClasses.length === 0 ? (
            <p className="text-sm text-slate-500">No classes assigned yet.</p>
          ) : (
            <div className="space-y-2.5">
              {uniqueClasses.map((cls) => {
                const count = studentCountByClass.get(cls.id) ?? 0;
                const stats = attendanceByClass.get(cls.id);
                const shiftA = stats?.SHIFT_A;
                const shiftB = stats?.SHIFT_B;
                return (
                  <div
                    key={cls.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{cls.name}</p>
                      <p className="text-xs text-slate-500">{count} active students</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/teacher/attendance?classId=${cls.id}&date=${todayIso}&shift=SHIFT_A`}
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                          shiftA
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                        }`}
                      >
                        {shiftA ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            Shift A ({shiftA.present}P·{shiftA.absent}A)
                          </>
                        ) : (
                          "Shift A (Pending)"
                        )}
                      </Link>
                      <Link
                        href={`/teacher/attendance?classId=${cls.id}&date=${todayIso}&shift=SHIFT_B`}
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                          shiftB
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                        }`}
                      >
                        {shiftB ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            Shift B ({shiftB.present}P·{shiftB.absent}A)
                          </>
                        ) : (
                          "Shift B (Pending)"
                        )}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card
        title={
          activeExam
            ? `Exam Marks Progress · ${activeExam.name} (${activeExam.term.name})`
            : "Assigned Subjects & Classes"
        }
        action={
          activeExam ? (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${activeExam.isLocked
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-700"
                  }`}
              >
                {activeExam.isLocked ? "Locked" : "Open for Entry"}
              </span>
              <Link
                href={`/teacher/results?examId=${activeExam.id}`}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                View Broadsheet →
              </Link>
            </div>
          ) : undefined
        }
      >
        {assignments.length === 0 ? (
          <p className="text-sm text-slate-500">
            No subject assignments have been configured yet.
          </p>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {assignments.map((a) => {
                const expected = studentCountByClass.get(a.classId) ?? 0;
                const entered = markCountMap.get(`${a.classId}:${a.subjectId}`) ?? 0;
                const pct =
                  expected > 0 ? Math.min(100, Math.round((entered / expected) * 100)) : 0;
                return (
                  <div
                    key={a.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {a.class.name} · {a.subject.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {a.subject.code} · {expected} student{expected === 1 ? "" : "s"}
                          {isAdmin ? ` · ${a.teacher.fullName}` : ""}
                        </p>
                      </div>
                      {activeExam && (
                        <span className="shrink-0 text-xs font-semibold text-slate-700 tabular-nums">
                          {entered}/{expected}
                        </span>
                      )}
                    </div>

                    {activeExam && (
                      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                        <div
                          className={`h-full rounded-full ${
                            pct === 100 && expected > 0
                              ? "bg-emerald-500"
                              : entered > 0
                                ? "bg-indigo-600"
                                : "bg-slate-300"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Link
                        href={
                          activeExam
                            ? `/teacher/marks?examId=${activeExam.id}&classId=${a.classId}&subjectId=${a.subjectId}`
                            : `/teacher/marks?classId=${a.classId}&subjectId=${a.subjectId}`
                        }
                        className="inline-flex min-h-[38px] items-center justify-center rounded-md bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        Marks
                      </Link>
                      <Link
                        href={
                          activeExam
                            ? `/teacher/results?classId=${a.classId}&examId=${activeExam.id}`
                            : `/teacher/results?classId=${a.classId}`
                        }
                        className="inline-flex min-h-[38px] items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Broadsheet
                      </Link>
                      <Link
                        href={`/teacher/students?classId=${a.classId}`}
                        className="inline-flex min-h-[38px] items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Students
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2.5 pr-4">Class</th>
                    <th className="py-2.5 pr-4">Subject</th>
                    {isAdmin && <th className="py-2.5 pr-4">Teacher</th>}
                    <th className="py-2.5 pr-4">Students</th>
                    {activeExam && <th className="py-2.5 pr-4">Marks Progress</th>}
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.map((a) => {
                    const expected = studentCountByClass.get(a.classId) ?? 0;
                    const entered = markCountMap.get(`${a.classId}:${a.subjectId}`) ?? 0;
                    const pct =
                      expected > 0 ? Math.min(100, Math.round((entered / expected) * 100)) : 0;

                    return (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="py-3 pr-4 font-medium text-slate-900">
                          {a.class.name}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          {a.subject.name}{" "}
                          <span className="text-xs text-slate-400">({a.subject.code})</span>
                        </td>
                        {isAdmin && (
                          <td className="py-3 pr-4 text-slate-600">{a.teacher.fullName}</td>
                        )}
                        <td className="py-3 pr-4 tabular-nums text-slate-600">{expected}</td>
                        {activeExam && (
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2.5">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${pct === 100 && expected > 0
                                      ? "bg-emerald-500"
                                      : entered > 0
                                        ? "bg-indigo-600"
                                        : "bg-slate-300"
                                    }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-slate-600 tabular-nums">
                                {entered}/{expected}
                              </span>
                            </div>
                          </td>
                        )}
                        <td className="py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Link
                              href={
                                activeExam
                                  ? `/teacher/marks?examId=${activeExam.id}&classId=${a.classId}&subjectId=${a.subjectId}`
                                  : `/teacher/marks?classId=${a.classId}&subjectId=${a.subjectId}`
                              }
                              className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                            >
                              Marks
                            </Link>
                            <Link
                              href={
                                activeExam
                                  ? `/teacher/results?classId=${a.classId}&examId=${activeExam.id}`
                                  : `/teacher/results?classId=${a.classId}`
                              }
                              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Broadsheet
                            </Link>
                            <Link
                              href={`/teacher/students?classId=${a.classId}`}
                              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Students
                            </Link>
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
