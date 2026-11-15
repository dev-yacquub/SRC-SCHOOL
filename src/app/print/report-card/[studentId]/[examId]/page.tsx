import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
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

export default async function PrintReportCardPage({
  params,
}: {
  params: Promise<{ studentId: string; examId: string }>;
}) {
  const user = await requireRole(["ADMIN", "ADMISSION", "TEACHER", "STUDENT"]);
  const { studentId, examId } = await params;
  const ctx = await getSchoolContext();

  const [student, exam, scales] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: { include: { academicYear: { select: { name: true } } } },
      },
    }),
    prisma.exam.findUnique({
      where: { id: examId },
      include: { term: { include: { academicYear: { select: { name: true } } } } },
    }),
    prisma.gradeScale.findMany({ orderBy: { minScore: "desc" } }),
  ]);

  if (!student || !exam) {
    return (
      <div className="p-8 text-sm text-slate-600">
        Report card not found.
      </div>
    );
  }

  if (user.role === "STUDENT") {
    if (student.userId !== user.userId) {
      redirect("/student/results");
    }
    if (!exam.isPublished) {
      return (
        <div className="min-h-screen bg-slate-100 p-8">
          <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Results Not Published Yet</p>
            <p className="mt-1 text-slate-600">
              {exam.name} results have not been published by the school administration yet.
            </p>
            <Link
              href="/student/results"
              className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
            >
              ← Back to My Results
            </Link>
          </div>
        </div>
      );
    }
  }

  if (user.role === "TEACHER") {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.userId },
    });
    const assigned = teacher
      ? await prisma.classSubject.findFirst({
          where: { teacherId: teacher.id, classId: student.classId },
        })
      : null;
    if (!assigned) {
      return (
        <div className="min-h-screen bg-slate-100 p-8">
          <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Access Restricted</p>
            <p className="mt-1 text-slate-600">
              You can only view or print report cards for students in your assigned classes.
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

  const [marks, classMarks, attendanceRecords, remarkRecord] = await Promise.all([
    prisma.mark.findMany({
      where: { studentId, examId },
      include: { subject: { select: { name: true, code: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
    prisma.mark.findMany({
      where: { examId, classId: student.classId },
      select: { studentId: true, score: true },
    }),
    prisma.attendance.findMany({
      where: { studentId },
      select: { status: true },
    }),
    prisma.reportRemark.findUnique({
      where: { examId_studentId: { examId, studentId } },
    }),
  ]);

  // Compute class rankings across classmates who have marks in this exam
  const classmateTotals = new Map<string, { obtained: number; count: number }>();
  for (const cm of classMarks) {
    const prev = classmateTotals.get(cm.studentId) ?? { obtained: 0, count: 0 };
    prev.obtained += cm.score;
    prev.count += 1;
    classmateTotals.set(cm.studentId, prev);
  }
  const rankings = computeClassRankings(
    Array.from(classmateTotals.entries()).map(([sid, vals]) => ({
      studentId: sid,
      totalObtained: vals.obtained,
      totalMax: vals.count * exam.maxMarks,
    }))
  );
  const rankInfo = rankings.find((r) => r.studentId === studentId) ?? null;
  const classAveragePercent = rankings[0]?.classAveragePercent ?? null;

  const subjectRows = marks.map((m) => {
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

  const totalObtained = marks.reduce((s, m) => s + m.score, 0);
  const totalMax = marks.length * exam.maxMarks;
  const overall = calculateLetterGrade(totalObtained, totalMax, scales);
  const attSummary = summarizeAttendance(attendanceRecords);

  const backHref =
    user.role === "STUDENT"
      ? "/student/results"
      : user.role === "TEACHER"
        ? `/teacher/results?classId=${student.classId}&examId=${exam.id}`
        : user.role === "ADMISSION"
          ? `/admission/students/${student.id}`
          : "/admin/exams";

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back
        </Link>
        <div className="flex items-center gap-2">
          {(user.role === "ADMIN" || user.role === "TEACHER") && (
            <Link
              href={`/print/report-cards/${student.classId}/${exam.id}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Print All {student.class.name} Cards
            </Link>
          )}
          <PrintButton label="Print / Save Report Card PDF" />
        </div>
      </div>

      <ReportCardSheet
        schoolName={ctx.schoolName}
        schoolAddress={ctx.settings?.schoolAddress}
        schoolPhone={ctx.settings?.schoolPhone}
        examName={exam.name}
        termName={exam.term.name}
        academicYearName={exam.term.academicYear.name}
        isPublished={exam.isPublished}
        student={{
          fullName: student.fullName,
          admissionNo: student.admissionNo,
          className: student.class.name,
          status: student.status,
          photo: student.photo,
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
        teacherRemark={remarkRecord?.teacherRemark}
        principalRemark={remarkRecord?.principalRemark}
      />
    </div>
  );
}
