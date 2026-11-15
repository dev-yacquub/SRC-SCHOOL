import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSchoolContext } from "@/lib/shell-context";
import {
  calculateLetterGrade,
  computeClassRankings,
  summarizeAttendance,
} from "@/lib/domain";
import { PrintButton } from "@/components/ui";
import { ReportCardSheet } from "@/components/ReportCardSheet";

export default async function BulkPrintClassReportCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string; examId: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const user = await requireRole(["ADMIN", "TEACHER"]);
  const { classId, examId } = await params;
  const { sort } = await searchParams;
  const sortBy = sort === "name" ? "name" : "rank";
  const ctx = await getSchoolContext();

  if (user.role === "TEACHER") {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.userId },
    });
    const assigned = teacher
      ? await prisma.classSubject.findFirst({
          where: { teacherId: teacher.id, classId },
        })
      : null;
    if (!assigned) {
      return (
        <div className="min-h-screen bg-slate-100 p-8">
          <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Access Restricted</p>
            <p className="mt-1 text-slate-600">
              You can only print bulk report cards for classes assigned to you.
            </p>
            <Link
              href="/teacher/results"
              className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
            >
              ← Back to Class Broadsheet
            </Link>
          </div>
        </div>
      );
    }
  }

  const [schoolClass, exam, scales, students, marks, attendanceRows, remarks] =
    await Promise.all([
      prisma.schoolClass.findUnique({
        where: { id: classId },
        include: { academicYear: { select: { name: true } } },
      }),
      prisma.exam.findUnique({
        where: { id: examId },
        include: { term: { include: { academicYear: { select: { name: true } } } } },
      }),
      prisma.gradeScale.findMany({ orderBy: { minScore: "desc" } }),
      prisma.student.findMany({
        where: { classId, status: "ACTIVE" },
        orderBy: { fullName: "asc" },
      }),
      prisma.mark.findMany({
        where: { examId, classId },
        include: { subject: { select: { name: true, code: true } } },
        orderBy: { subject: { name: "asc" } },
      }),
      prisma.attendance.findMany({
        where: { classId },
        select: { studentId: true, status: true },
      }),
      prisma.reportRemark.findMany({
        where: { examId, student: { classId } },
      }),
    ]);

  if (!schoolClass || !exam) {
    return (
      <div className="p-8 text-sm text-slate-600">
        Class or examination not found.
      </div>
    );
  }

  const marksByStudent = new Map<string, typeof marks>();
  for (const m of marks) {
    const arr = marksByStudent.get(m.studentId) ?? [];
    arr.push(m);
    marksByStudent.set(m.studentId, arr);
  }

  const attByStudent = new Map<
    string,
    { status: "PRESENT" | "ABSENT" }[]
  >();
  for (const a of attendanceRows) {
    const arr = attByStudent.get(a.studentId) ?? [];
    arr.push({ status: a.status === "ABSENT" ? "ABSENT" : "PRESENT" });
    attByStudent.set(a.studentId, arr);
  }

  const remarkByStudent = new Map(remarks.map((r) => [r.studentId, r]));

  const rankings = computeClassRankings(
    students
      .map((s) => {
        const stMarks = marksByStudent.get(s.id) ?? [];
        if (stMarks.length === 0) return null;
        return {
          studentId: s.id,
          totalObtained: stMarks.reduce((acc, m) => acc + m.score, 0),
          totalMax: stMarks.length * exam.maxMarks,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  );
  const rankMap = new Map(rankings.map((r) => [r.studentId, r]));
  const classAveragePercent = rankings[0]?.classAveragePercent ?? null;

  const orderedStudents = [...students].sort((a, b) => {
    if (sortBy === "rank") {
      const ra = rankMap.get(a.id)?.rank ?? 99999;
      const rb = rankMap.get(b.id)?.rank ?? 99999;
      if (ra !== rb) return ra - rb;
    }
    return a.fullName.localeCompare(b.fullName);
  });

  const backHref =
    user.role === "TEACHER"
      ? `/teacher/results?classId=${classId}&examId=${examId}`
      : `/teacher/results?classId=${classId}&examId=${examId}`;

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="no-print mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Back to Broadsheet
          </Link>
          <span className="text-xs text-slate-400">|</span>
          <span className="text-sm font-semibold text-slate-900">
            {schoolClass.name} · {exam.name} ({orderedStudents.length} Report Cards)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <Link
              href={`/print/report-cards/${classId}/${examId}?sort=rank`}
              className={`rounded-md px-2.5 py-1 font-medium ${
                sortBy === "rank"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Order by Rank
            </Link>
            <Link
              href={`/print/report-cards/${classId}/${examId}?sort=name`}
              className={`rounded-md px-2.5 py-1 font-medium ${
                sortBy === "name"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Order by Name
            </Link>
          </div>
          <PrintButton label={`Print All ${orderedStudents.length} Report Cards`} />
        </div>
      </div>

      {orderedStudents.length === 0 ? (
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No active students in {schoolClass.name}.
        </div>
      ) : (
        orderedStudents.map((st, idx) => {
          const stMarks = marksByStudent.get(st.id) ?? [];
          const subjectRows = stMarks.map((m) => {
            const g = calculateLetterGrade(m.score, exam.maxMarks, scales);
            return {
              subjectName: m.subject.name,
              subjectCode: m.subject.code,
              score: m.score,
              maxMarks: exam.maxMarks,
              percentage: g.percentage,
              grade: g.grade,
              scaleRemark: g.remark,
              subjectRemark: m.remark,
            };
          });
          const totalObtained = stMarks.reduce((s, m) => s + m.score, 0);
          const totalMax = stMarks.length * exam.maxMarks;
          const overall = calculateLetterGrade(totalObtained, totalMax, scales);
          const rankInfo = rankMap.get(st.id) ?? null;
          const attSummary = summarizeAttendance(attByStudent.get(st.id) ?? []);
          const rem = remarkByStudent.get(st.id);

          return (
            <ReportCardSheet
              key={st.id}
              schoolName={ctx.schoolName}
              schoolAddress={ctx.settings?.schoolAddress}
              schoolPhone={ctx.settings?.schoolPhone}
              examName={exam.name}
              termName={exam.term.name}
              academicYearName={exam.term.academicYear.name}
              isPublished={exam.isPublished}
              student={{
                fullName: st.fullName,
                admissionNo: st.admissionNo,
                className: schoolClass.name,
                status: st.status,
                photo: st.photo,
              }}
              subjects={subjectRows}
              totalObtained={totalObtained}
              totalMax={totalMax}
              overallPercentage={overall.percentage}
              overallGrade={overall.grade}
              overallRemark={overall.remark}
              rank={rankInfo?.rank ?? null}
              outOf={rankInfo?.outOf ?? 0}
              classAveragePercent={classAveragePercent}
              attendance={attSummary}
              teacherRemark={rem?.teacherRemark}
              principalRemark={rem?.principalRemark}
              pageBreakAfter={idx < orderedStudents.length - 1}
            />
          );
        })
      )}
    </div>
  );
}

