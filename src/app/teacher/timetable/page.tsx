import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { DAYS_OF_WEEK } from "@/lib/domain";
import { Card, PageHeader, PrintButton } from "@/components/ui";

export default async function TeacherTimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; teacherId?: string }>;
}) {
  const user = await requireRole(["TEACHER", "ADMIN"]);
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const classIdParam = sp.classId ?? "";
  const teacherIdParam = sp.teacherId ?? "";

  let teacher: { id: string; fullName: string } | null = null;
  let teachers: { id: string; fullName: string }[] = [];
  let classes: { id: string; name: string; level: number }[] = [];

  if (isAdmin) {
    [classes, teachers] = await Promise.all([
      prisma.schoolClass.findMany({
        orderBy: [{ level: "asc" }, { name: "asc" }],
        select: { id: true, name: true, level: true },
      }),
      prisma.teacher.findMany({
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      }),
    ]);
  } else {
    teacher = await prisma.teacher.findUnique({
      where: { userId: user.userId },
      select: { id: true, fullName: true },
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

  const allowedClassIds = new Set(classes.map((c) => c.id));
  const selectedClassId = allowedClassIds.has(classIdParam) ? classIdParam : "";
  const selectedTeacherId =
    isAdmin && teachers.some((t) => t.id === teacherIdParam)
      ? teacherIdParam
      : isAdmin
        ? ""
        : teacher?.id ?? "";

  const slots =
    !isAdmin && !teacher
      ? []
      : await prisma.timetableSlot.findMany({
          where: {
            classSubject: {
              ...(selectedTeacherId ? { teacherId: selectedTeacherId } : {}),
              ...(selectedClassId ? { classId: selectedClassId } : {}),
            },
          },
          include: {
            classSubject: {
              include: {
                class: { select: { id: true, name: true } },
                subject: { select: { name: true, code: true } },
                teacher: { select: { fullName: true } },
              },
            },
          },
          orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }, { classSubject: { class: { level: "asc" } } }],
        });

  const maxPeriod = Math.max(6, ...slots.map((s) => s.period));
  const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);

  const selectedClassName = classes.find((c) => c.id === selectedClassId)?.name;
  const selectedTeacherName = teachers.find((t) => t.id === selectedTeacherId)?.fullName;

  const filterSummary = isAdmin
    ? [
        selectedTeacherName ? `Teacher: ${selectedTeacherName}` : "All Teachers",
        selectedClassName ? `Class: ${selectedClassName}` : "All Classes",
      ].join(" · ")
    : teacher
      ? `${teacher.fullName}${selectedClassName ? ` · ${selectedClassName}` : " · All Assigned Classes"}`
      : "No teacher profile configured";

  const todayDay = new Date().getDay();
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Weekly Timetable"
          subtitle={filterSummary}
          action={<PrintButton label="Print Timetable" />}
        />
      </div>

      <Card>
        <form
          method="GET"
          className="no-print mb-4 grid grid-cols-1 gap-3 border-b border-slate-100 pb-4 sm:flex sm:flex-wrap sm:items-end"
        >
          {isAdmin && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Teacher
              </label>
              <select
                name="teacherId"
                defaultValue={selectedTeacherId}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
              >
                <option value="">All Teachers</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Class
            </label>
            <select
              name="classId"
              defaultValue={selectedClassId}
              className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
            >
              <option value="">{isAdmin ? "All Classes" : "All My Classes"}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="min-h-[42px] flex-1 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:flex-initial"
            >
              Apply Filter
            </button>
            {(selectedClassId || (isAdmin && selectedTeacherId)) && (
              <Link
                href="/teacher/timetable"
                className="inline-flex min-h-[42px] items-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Reset
              </Link>
            )}
          </div>
        </form>

        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-900">
            Weekly Lesson Schedule
          </h2>
          <p className="text-xs text-slate-500">{filterSummary}</p>
        </div>

        {/* Mobile Day-by-Day Agenda */}
        <div className="space-y-4 md:hidden">
          {DAYS_OF_WEEK.map((d) => {
            const daySlots = slots
              .filter((s) => s.dayOfWeek === d.value)
              .sort((a, b) => a.period - b.period);
            const isToday = d.value === todayDay;
            return (
              <div
                key={d.value}
                className={`rounded-xl border p-3.5 ${
                  isToday
                    ? "border-indigo-300 bg-indigo-50/40"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">{d.label}</h3>
                  {isToday && (
                    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                      Today
                    </span>
                  )}
                </div>
                {daySlots.length === 0 ? (
                  <p className="text-xs text-slate-400">No classes scheduled</p>
                ) : (
                  <div className="space-y-2">
                    {daySlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-white p-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-700">
                            P{slot.period}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {slot.classSubject.subject.name}
                            </p>
                            <p className="text-xs text-slate-600">
                              {slot.classSubject.class.name}
                              {isAdmin && !selectedTeacherId
                                ? ` · ${slot.classSubject.teacher.fullName}`
                                : ""}
                            </p>
                            <p className="text-[11px] text-slate-400 tabular-nums">
                              {slot.startTime}–{slot.endTime}
                            </p>
                          </div>
                        </div>
                        <Link
                          href={`/teacher/attendance?classId=${slot.classSubject.classId}&date=${todayIso}`}
                          className="no-print shrink-0 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                        >
                          Attend →
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop Weekly Matrix */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase">
                <th className="p-3">Period</th>
                {DAYS_OF_WEEK.map((d) => (
                  <th key={d.value} className="min-w-[125px] p-3">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {periods.map((p) => (
                <tr key={p}>
                  <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">
                    Period {p}
                  </td>
                  {DAYS_OF_WEEK.map((d) => {
                    const cellSlots = slots.filter(
                      (s) => s.dayOfWeek === d.value && s.period === p
                    );
                    return (
                      <td key={d.value} className="p-2 align-top">
                        {cellSlots.length > 0 ? (
                          <div className="space-y-1.5">
                            {cellSlots.map((slot) => (
                              <div
                                key={slot.id}
                                className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-2"
                              >
                                <p className="font-semibold text-indigo-950">
                                  {slot.classSubject.subject.name}
                                </p>
                                <p className="text-[11px] font-medium text-indigo-700">
                                  {slot.classSubject.class.name}
                                </p>
                                {isAdmin && !selectedTeacherId && (
                                  <p className="text-[10px] text-slate-600">
                                    {slot.classSubject.teacher.fullName}
                                  </p>
                                )}
                                <p className="text-[10px] text-slate-500 tabular-nums">
                                  {slot.startTime}–{slot.endTime}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
