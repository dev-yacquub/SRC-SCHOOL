import React from "react";
import { getOrdinalSuffix } from "@/lib/domain";

export type ReportCardSubjectRow = {
  subjectName: string;
  subjectCode: string;
  score: number;
  maxMarks: number;
  percentage: number;
  grade: string;
  scaleRemark: string;
  subjectRemark: string | null;
};

export type ReportCardSheetProps = {
  schoolName: string;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  examName: string;
  termName: string;
  academicYearName: string;
  isPublished: boolean;
  student: {
    fullName: string;
    admissionNo: string;
    className: string;
    status: string;
    photo?: string | null;
  };
  subjects: ReportCardSubjectRow[];
  totalObtained: number;
  totalMax: number;
  overallPercentage: number;
  overallGrade: string;
  overallRemark: string;
  rank: number | null;
  outOf: number;
  classAveragePercent: number | null;
  attendance: {
    total: number;
    present: number;
    late: number;
    absent: number;
    ratePercent: number;
  };
  teacherRemark?: string | null;
  principalRemark?: string | null;
  pageBreakAfter?: boolean;
};

export function ReportCardSheet({
  schoolName,
  schoolAddress,
  schoolPhone,
  examName,
  termName,
  academicYearName,
  isPublished,
  student,
  subjects,
  totalObtained,
  totalMax,
  overallPercentage,
  overallGrade,
  overallRemark,
  rank,
  outOf,
  classAveragePercent,
  attendance,
  teacherRemark,
  principalRemark,
  pageBreakAfter = false,
}: ReportCardSheetProps) {
  return (
    <div
      className={`print-only-sheet mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm ${
        pageBreakAfter ? "break-after-page mb-8 print:mb-0" : ""
      }`}
    >
      <div className="border-b-2 border-slate-900 pb-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900 uppercase">
            {schoolName}
          </h1>
          {!isPublished && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">
              Draft
            </span>
          )}
        </div>
        {(schoolAddress || schoolPhone) && (
          <p className="text-xs text-slate-500">
            {[schoolAddress, schoolPhone].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="mt-3 inline-block rounded bg-slate-900 px-3 py-1 text-xs font-bold tracking-wider text-white uppercase">
          Student Academic Report Card
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-700">
          {examName} · {termName} · {academicYearName}
        </p>
      </div>

      <div className="my-5 flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-4 text-sm">
        <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
          <div>
            <span className="text-xs text-slate-500">Student Name:</span>{" "}
            <strong className="block text-slate-900">{student.fullName}</strong>
          </div>
          <div>
            <span className="text-xs text-slate-500">Admission No:</span>{" "}
            <strong className="block font-mono text-slate-900">
              {student.admissionNo}
            </strong>
          </div>
          <div>
            <span className="text-xs text-slate-500">Class:</span>{" "}
            <strong className="block text-slate-900">{student.className}</strong>
          </div>
          <div>
            <span className="text-xs text-slate-500">Class Rank:</span>{" "}
            <strong className="block text-indigo-700">
              {rank !== null ? `${getOrdinalSuffix(rank)} of ${outOf}` : "—"}
            </strong>
          </div>
          <div>
            <span className="text-xs text-slate-500">Class Average:</span>{" "}
            <strong className="block text-slate-900 tabular-nums">
              {classAveragePercent !== null ? `${classAveragePercent}%` : "—"}
            </strong>
          </div>
          <div>
            <span className="text-xs text-slate-500">Attendance:</span>{" "}
            <strong className="block text-slate-900 tabular-nums">
              {attendance.total > 0
                ? `${attendance.present + attendance.late}/${attendance.total} (${attendance.ratePercent}%)`
                : "No logs"}
            </strong>
          </div>
        </div>

        {student.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={student.photo}
            alt={student.fullName}
            className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover"
          />
        )}
      </div>

      <table className="w-full text-left text-sm">
        <thead className="border-b-2 border-slate-800 text-xs text-slate-600 uppercase">
          <tr>
            <th className="py-2 pr-4">Subject</th>
            <th className="py-2 pr-4 text-right">Score</th>
            <th className="py-2 pr-4 text-right">Max</th>
            <th className="py-2 pr-4 text-right">%</th>
            <th className="py-2 pr-4 text-center">Grade</th>
            <th className="py-2">Teacher Remark</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {subjects.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-6 text-center text-sm text-slate-500">
                No marks recorded for this examination yet.
              </td>
            </tr>
          ) : (
            subjects.map((sub) => (
              <tr key={sub.subjectCode + sub.subjectName}>
                <td className="py-2.5 pr-4 font-medium text-slate-900">
                  {sub.subjectName}{" "}
                  <span className="text-xs text-slate-400">({sub.subjectCode})</span>
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{sub.score}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-slate-500">
                  {sub.maxMarks}
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums">
                  {sub.percentage}%
                </td>
                <td className="py-2.5 pr-4 text-center font-bold text-indigo-700">
                  {sub.grade}
                </td>
                <td className="py-2.5 text-xs text-slate-600">
                  {sub.subjectRemark || sub.scaleRemark}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {subjects.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-slate-900 font-bold text-slate-900">
              <td className="py-3 pr-4">Total / Overall Average</td>
              <td className="py-3 pr-4 text-right tabular-nums">{totalObtained}</td>
              <td className="py-3 pr-4 text-right tabular-nums">{totalMax}</td>
              <td className="py-3 pr-4 text-right tabular-nums">
                {overallPercentage}%
              </td>
              <td className="py-3 pr-4 text-center text-indigo-700">
                {overallGrade}
              </td>
              <td className="py-3">{overallRemark}</td>
            </tr>
          </tfoot>
        )}
      </table>

      <div className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 text-xs sm:grid-cols-2">
        <div>
          <p className="font-semibold text-slate-600 uppercase">
            Class Teacher&apos;s Remark
          </p>
          <p className="mt-1 text-sm text-slate-800">
            {teacherRemark || <span className="text-slate-400">—</span>}
          </p>
        </div>
        <div>
          <p className="font-semibold text-slate-600 uppercase">
            Principal&apos;s Remark
          </p>
          <p className="mt-1 text-sm text-slate-800">
            {principalRemark || <span className="text-slate-400">—</span>}
          </p>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-8 border-t border-slate-200 pt-6 text-xs text-slate-500">
        <div>
          <p>Class Teacher Signature: _______________________</p>
        </div>
        <div className="text-right">
          <p>Principal Signature &amp; Stamp: ___________________</p>
        </div>
      </div>
    </div>
  );
}

