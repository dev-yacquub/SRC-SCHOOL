import React from "react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { DAYS_OF_WEEK } from "@/lib/domain";
import { Card, PageHeader } from "@/components/ui";

export default async function StudentTimetablePage() {
  const user = await requireRole(["STUDENT"]);
  const student = await prisma.student.findUnique({
    where: { userId: user.userId },
    include: { class: true },
  });

  const slots = student
    ? await prisma.timetableSlot.findMany({
        where: { classSubject: { classId: student.classId } },
        include: {
          classSubject: {
            include: {
              subject: { select: { name: true } },
              teacher: { select: { fullName: true } },
            },
          },
        },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
      })
    : [];

  const periods = [1, 2, 3, 4, 5, 6];

  return (
    <div>
      <PageHeader
        title="My Class Timetable"
        subtitle={student ? `Weekly schedule for ${student.class.name}` : undefined}
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase">
                <th className="p-3">Period</th>
                {DAYS_OF_WEEK.map((d) => (
                  <th key={d.value} className="p-3">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {periods.map((p) => (
                <tr key={p}>
                  <td className="p-3 font-semibold text-slate-700">Period {p}</td>
                  {DAYS_OF_WEEK.map((d) => {
                    const slot = slots.find(
                      (s) => s.dayOfWeek === d.value && s.period === p
                    );
                    return (
                      <td key={d.value} className="p-2 align-top">
                        {slot ? (
                          <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-2">
                            <p className="font-semibold text-indigo-950">
                              {slot.classSubject.subject.name}
                            </p>
                            <p className="text-[11px] text-indigo-700">
                              {slot.classSubject.teacher.fullName}
                            </p>
                            <p className="text-[10px] text-slate-500 tabular-nums">
                              {slot.startTime}–{slot.endTime}
                            </p>
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

