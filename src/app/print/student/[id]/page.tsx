import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSchoolContext } from "@/lib/shell-context";
import { PrintButton } from "@/components/ui";

type DocTab = "all" | "id-card" | "admission-form" | "transfer-certificate";

export default async function PrintStudentCardAndFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const user = await requireRole(["ADMISSION", "ADMIN", "STUDENT"]);
  const { id } = await params;
  const { doc } = await searchParams;
  const ctx = await getSchoolContext();

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      class: { include: { academicYear: true } },
      user: { select: { username: true } },
    },
  });

  if (!student) {
    return <div className="p-8 text-sm text-slate-600">Student not found.</div>;
  }

  if (user.role === "STUDENT" && student.userId !== user.userId) {
    redirect("/student");
  }

  const activeDoc: DocTab =
    doc === "id-card" ||
    doc === "admission-form" ||
    doc === "transfer-certificate"
      ? doc
      : "all";

  const showIdCard = activeDoc === "all" || activeDoc === "id-card";
  const showAdmission = activeDoc === "all" || activeDoc === "admission-form";
  const showTransfer =
    activeDoc === "transfer-certificate" ||
    (activeDoc === "all" && student.status !== "ACTIVE");

  const tabs: { key: DocTab; label: string }[] = [
    { key: "all", label: "All Docs" },
    { key: "id-card", label: "ID Card" },
    { key: "admission-form", label: "Admission Form" },
    { key: "transfer-certificate", label: "Transfer / Leaving Certificate" },
  ];

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <Link
          href={
            user.role === "STUDENT"
              ? "/student/profile"
              : `/admission/students/${student.id}`
          }
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/print/student/${student.id}?doc=${t.key}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                activeDoc === t.key
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <PrintButton label="Print / Save PDF" />
      </div>

      <div className="mx-auto max-w-3xl space-y-8">
        {showIdCard && (
          <div className="mx-auto w-96 overflow-hidden rounded-2xl border-2 border-indigo-700 bg-white shadow-md">
            <div className="bg-indigo-700 px-5 py-3 text-white">
              <p className="text-sm font-bold">{ctx.schoolName}</p>
              <p className="text-[11px] text-indigo-100">
                STUDENT IDENTITY CARD · {ctx.settings?.schoolPhone}
              </p>
            </div>
            <div className="flex items-center gap-4 p-5">
              {student.photo ? (
                <img
                  src={student.photo}
                  alt={student.fullName}
                  className="h-20 w-20 rounded-xl border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-2xl font-bold text-indigo-700">
                  {student.fullName.charAt(0)}
                </div>
              )}
              <div className="min-w-0 text-xs">
                <p className="truncate text-base font-bold text-slate-900">
                  {student.fullName}
                </p>
                <p className="mt-1 font-mono font-semibold text-indigo-700">
                  {student.admissionNo}
                </p>
                <p className="mt-0.5 text-slate-600">Class: {student.class.name}</p>
                <p className="text-slate-600">
                  Year: {student.class.academicYear.name}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Guardian: {student.guardianPhone}
                </p>
              </div>
            </div>
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-2 text-[10px] text-slate-500">
              {ctx.settings?.schoolAddress} · Status: {student.status}
            </div>
          </div>
        )}

        {showAdmission && (
          <div className="print-only-sheet rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="border-b border-slate-200 pb-4 text-center">
              <h2 className="text-xl font-bold text-slate-900">{ctx.schoolName}</h2>
              <p className="text-xs text-slate-500">
                {ctx.settings?.schoolAddress} · {ctx.settings?.schoolPhone}
              </p>
              <p className="mt-2 text-sm font-bold tracking-wide text-slate-800 uppercase">
                Student Admission Record
              </p>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Admission Number</dt>
                <dd className="font-mono font-bold text-slate-900">
                  {student.admissionNo}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Student Login Username</dt>
                <dd className="font-mono font-medium text-slate-900">
                  {student.user.username}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Full Name</dt>
                <dd className="font-semibold text-slate-900">{student.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Class</dt>
                <dd className="font-semibold text-slate-900">
                  {student.class.name} ({student.class.academicYear.name})
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Gender</dt>
                <dd className="text-slate-900">{student.gender}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Date of Birth</dt>
                <dd className="text-slate-900">
                  {student.dob ? new Date(student.dob).toLocaleDateString() : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Guardian Name</dt>
                <dd className="text-slate-900">{student.guardianName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Guardian Phone</dt>
                <dd className="text-slate-900">{student.guardianPhone}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Address</dt>
                <dd className="text-slate-900">{student.address ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Previous School</dt>
                <dd className="text-slate-900">{student.previousSchool ?? "—"}</dd>
              </div>
            </dl>

            <div className="mt-10 flex justify-between border-t border-slate-200 pt-6 text-xs text-slate-500">
              <span>
                Admission Date: {new Date(student.admissionDate).toLocaleDateString()}
              </span>
              <span>Admission Officer Signature: _____________________</span>
            </div>
          </div>
        )}

        {showTransfer && (
          <div className="print-only-sheet rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="border-b-2 border-slate-900 pb-4 text-center">
              <h2 className="text-xl font-bold text-slate-900">{ctx.schoolName}</h2>
              <p className="text-xs text-slate-500">
                {ctx.settings?.schoolAddress} · {ctx.settings?.schoolPhone} ·{" "}
                {ctx.settings?.schoolEmail}
              </p>
              <p className="mt-2 inline-block rounded-md bg-slate-900 px-3 py-1 text-xs font-bold tracking-wider text-white uppercase">
                {student.status === "GRADUATED"
                  ? "School Leaving & Completion Certificate"
                  : "Student Transfer / Leaving Certificate"}
              </p>
            </div>

            <div className="mt-6 space-y-4 text-sm leading-relaxed text-slate-800">
              <p>
                This is to certify that <strong>{student.fullName}</strong> (Admission
                No: <strong className="font-mono">{student.admissionNo}</strong>), son /
                daughter of <strong>{student.guardianName}</strong>, was enrolled at{" "}
                <strong>{ctx.schoolName}</strong> from{" "}
                <strong>
                  {new Date(student.admissionDate).toLocaleDateString()}
                </strong>
                .
              </p>

              <dl className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
                <div>
                  <dt className="text-slate-500">Last Class Attended</dt>
                  <dd className="font-semibold text-slate-900">
                    {student.class.name} ({student.class.academicYear.name})
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Current Record Status</dt>
                  <dd className="font-semibold text-slate-900">{student.status}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Date of Birth</dt>
                  <dd className="font-semibold text-slate-900">
                    {student.dob ? new Date(student.dob).toLocaleDateString() : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Issue Date</dt>
                  <dd className="font-semibold text-slate-900">
                    {(student.statusUpdatedAt
                      ? new Date(student.statusUpdatedAt)
                      : new Date()
                    ).toLocaleDateString()}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500">Reason / Remarks</dt>
                  <dd className="font-medium text-slate-900">
                    {student.statusReason ??
                      (student.status === "GRADUATED"
                        ? "Successfully completed the prescribed academic program."
                        : "Issued upon guardian request / school transfer.")}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-8 border-t border-slate-200 pt-6 text-xs text-slate-500">
              <div>Admission Officer: _______________________</div>
              <div className="text-right">Principal Signature & Stamp: ___________________</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
