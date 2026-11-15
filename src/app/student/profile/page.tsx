import React from "react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Card, PageHeader, StatusBadge } from "@/components/ui";

export default async function StudentProfilePage() {
  const user = await requireRole(["STUDENT"]);
  const student = await prisma.student.findUnique({
    where: { userId: user.userId },
    include: {
      class: { include: { academicYear: true } },
      user: { select: { username: true } },
    },
  });

  if (!student) {
    return <p className="text-sm text-slate-500">Student profile not found.</p>;
  }

  return (
    <div>
      <PageHeader
        title="My Profile"
        subtitle="Personal, academic, and guardian information on file"
      />

      <Card className="max-w-2xl">
        <div className="mb-6 flex items-center gap-4 border-b border-slate-100 pb-5">
          {student.photo ? (
            <img
              src={student.photo}
              alt={student.fullName}
              className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-indigo-100 text-xl font-bold text-indigo-700">
              {student.fullName.charAt(0)}
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-slate-900">{student.fullName}</h2>
            <p className="font-mono text-xs text-slate-500">
              {student.admissionNo} · @{student.user.username}
            </p>
            <div className="mt-1.5">
              <StatusBadge value={student.status} />
            </div>
          </div>
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Class</dt>
            <dd className="font-medium text-slate-900">
              {student.class.name} ({student.class.academicYear.name})
            </dd>
          </div>
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
            <dt className="text-xs text-slate-500">Guardian Name</dt>
            <dd className="font-medium text-slate-900">{student.guardianName}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Guardian Phone</dt>
            <dd className="font-medium text-slate-900">{student.guardianPhone}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">Address</dt>
            <dd className="font-medium text-slate-900">{student.address ?? "—"}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

