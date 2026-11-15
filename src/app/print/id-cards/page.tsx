import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSchoolContext } from "@/lib/shell-context";
import { PrintButton } from "@/components/ui";

export default async function PrintClassIdCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  await requireRole(["ADMISSION", "ADMIN"]);
  const { classId } = await searchParams;
  const ctx = await getSchoolContext();

  const [classes, students] = await Promise.all([
    prisma.schoolClass.findMany({
      orderBy: [{ level: "asc" }, { name: "asc" }],
      include: { academicYear: { select: { name: true } } },
    }),
    prisma.student.findMany({
      where: {
        status: "ACTIVE",
        ...(classId ? { classId } : {}),
      },
      include: {
        class: { include: { academicYear: { select: { name: true } } } },
      },
      orderBy: [{ class: { level: "asc" } }, { fullName: "asc" }],
    }),
  ]);

  const selectedClass = classes.find((c) => c.id === classId) ?? null;

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="no-print mx-auto mb-6 flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link
            href="/admission/students"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Back to Directory
          </Link>
          <span className="text-xs text-slate-500">
            {selectedClass
              ? `${selectedClass.name} (${students.length} cards)`
              : `All Active Students (${students.length} cards)`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {classes.map((c) => (
            <Link
              key={c.id}
              href={`/print/id-cards?classId=${c.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                classId === c.id
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {c.name}
            </Link>
          ))}
          <PrintButton label="Print All ID Cards" />
        </div>
      </div>

      {students.length === 0 ? (
        <div className="mx-auto max-w-5xl rounded-xl bg-white p-8 text-center text-sm text-slate-500">
          No active students found for ID card printing.
        </div>
      ) : (
        <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2">
          {students.map((student) => (
            <div
              key={student.id}
              className="break-inside-avoid overflow-hidden rounded-2xl border-2 border-indigo-700 bg-white shadow-sm"
            >
              <div className="bg-indigo-700 px-4 py-2.5 text-white">
                <p className="text-sm font-bold">{ctx.schoolName}</p>
                <p className="text-[10px] text-indigo-100">
                  STUDENT IDENTITY CARD · {ctx.settings?.schoolPhone}
                </p>
              </div>
              <div className="flex items-center gap-4 p-4">
                {student.photo ? (
                  <img
                    src={student.photo}
                    alt={student.fullName}
                    className="h-18 w-18 shrink-0 rounded-xl border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-18 w-18 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xl font-bold text-indigo-700">
                    {student.fullName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 text-xs">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {student.fullName}
                  </p>
                  <p className="mt-0.5 font-mono font-semibold text-indigo-700">
                    {student.admissionNo}
                  </p>
                  <p className="mt-0.5 text-slate-600">Class: {student.class.name}</p>
                  <p className="text-slate-600">
                    Year: {student.class.academicYear.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Guardian: {student.guardianPhone}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

