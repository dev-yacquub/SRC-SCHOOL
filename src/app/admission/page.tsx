import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, StatCard, StatusBadge } from "@/components/ui";

export default async function AdmissionDashboard() {
  const [
    totalStudents,
    activeMale,
    activeFemale,
    graduatedCount,
    exitedCount,
    recentStudents,
    classCounts,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { status: "ACTIVE", gender: "MALE" } }),
    prisma.student.count({ where: { status: "ACTIVE", gender: "FEMALE" } }),
    prisma.student.count({ where: { status: "GRADUATED" } }),
    prisma.student.count({
      where: { status: { in: ["TRANSFERRED", "WITHDRAWN"] } },
    }),
    prisma.student.findMany({
      include: { class: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.schoolClass.findMany({
      orderBy: [{ level: "asc" }, { name: "asc" }],
      include: {
        academicYear: { select: { name: true } },
        students: {
          where: { status: "ACTIVE" },
          select: { gender: true },
        },
      },
    }),
  ]);

  const activeCount = activeMale + activeFemale;

  return (
    <div>
      <PageHeader
        title="Admission Dashboard"
        subtitle="Manage student registrations, transfers, promotions, and ID cards"
        action={
          <>
            <Link
              href="/admission/students"
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Student Directory
            </Link>
            <Link
              href="/admission/late"
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Late Students
            </Link>
            <Link
              href="/admission/import"
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Import Excel
            </Link>
            <Link
              href="/admission/register"
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Register Student
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Registered"
          value={totalStudents}
          hint={`${classCounts.length} classes configured`}
          tone="indigo"
        />
        <StatCard
          label="Active Students"
          value={activeCount}
          hint={`${activeMale} Boys · ${activeFemale} Girls`}
          tone="emerald"
        />
        <StatCard label="Graduated" value={graduatedCount} tone="slate" />
        <StatCard
          label="Transferred / Withdrawn"
          value={exitedCount}
          tone="amber"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Recent Admissions" className="lg:col-span-2">
          {recentStudents.length === 0 ? (
            <p className="text-sm text-slate-500">No students registered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2 pr-3">Adm No.</th>
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentStudents.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-3 font-mono text-xs text-slate-600">
                        {s.admissionNo}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">
                        <Link
                          href={`/admission/students/${s.id}`}
                          className="hover:text-indigo-600 hover:underline"
                        >
                          {s.fullName}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{s.class.name}</td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge value={s.status} />
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex items-center gap-3">
                          <Link
                            href={`/admission/students/${s.id}`}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
                          >
                            Profile
                          </Link>
                          <Link
                            href={`/print/student/${s.id}`}
                            className="text-xs font-medium text-indigo-600 hover:underline"
                          >
                            ID & Docs
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Active Students per Class">
          <div className="space-y-2.5">
            {classCounts.map((c) => {
              const boys = c.students.filter((st) => st.gender === "MALE").length;
              const girls = c.students.filter((st) => st.gender === "FEMALE").length;
              return (
                <Link
                  key={c.id}
                  href={`/admission/students?classId=${c.id}`}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm transition hover:bg-indigo-50/70"
                >
                  <div>
                    <p className="font-medium text-slate-800">{c.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {c.academicYear.name} · {boys}M / {girls}F
                    </p>
                  </div>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {c.students.length}
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
