import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { calculateLetterGrade } from "@/lib/domain";
import { Card, PageHeader } from "@/components/ui";
import { Printer } from "lucide-react";

export default async function StudentResultsPage() {
  const user = await requireRole(["STUDENT"]);
  const student = await prisma.student.findUnique({
    where: { userId: user.userId },
  });

  if (!student) {
    return <p className="text-sm text-slate-500">Student record not found.</p>;
  }

  const [exams, scales] = await Promise.all([
    prisma.exam.findMany({
      where: { isPublished: true },
      include: {
        term: { include: { academicYear: { select: { name: true } } } },
        marks: {
          where: { studentId: student.id },
          include: { subject: true },
          orderBy: { subject: { name: "asc" } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.gradeScale.findMany({ orderBy: { minScore: "desc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="My Exam Results"
        subtitle="Published examination results and downloadable report cards"
      />

      {exams.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">
            No exam results have been published by Admin yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {exams.map((exam) => {
            const totalObtained = exam.marks.reduce((s, m) => s + m.score, 0);
            const totalMax = exam.marks.length * exam.maxMarks;
            const overall =
              totalMax > 0
                ? calculateLetterGrade(totalObtained, totalMax, scales)
                : null;

            return (
              <Card
                key={exam.id}
                title={`${exam.name} — ${exam.term.name} (${exam.term.academicYear.name})`}
                subtitle={
                  overall
                    ? `Average: ${overall.percentage}% · Overall Grade: ${overall.grade}`
                    : undefined
                }
                action={
                  <Link
                    href={`/print/report-card/${student.id}/${exam.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Report Card PDF
                  </Link>
                }
              >
                {exam.marks.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No marks recorded for you in this exam.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                        <tr>
                          <th className="py-2 pr-4">Subject</th>
                          <th className="py-2 pr-4 text-right">Score</th>
                          <th className="py-2 pr-4 text-right">Out Of</th>
                          <th className="py-2 pr-4">Grade</th>
                          <th className="py-2">Remark</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {exam.marks.map((m) => {
                          const g = calculateLetterGrade(
                            m.score,
                            exam.maxMarks,
                            scales
                          );
                          return (
                            <tr key={m.id}>
                              <td className="py-2.5 pr-4 font-medium text-slate-900">
                                {m.subject.name}
                              </td>
                              <td className="py-2.5 pr-4 text-right font-semibold tabular-nums">
                                {m.score}
                              </td>
                              <td className="py-2.5 pr-4 text-right text-slate-500 tabular-nums">
                                {exam.maxMarks}
                              </td>
                              <td className="py-2.5 pr-4 font-bold text-indigo-700">
                                {g.grade}
                              </td>
                              <td className="py-2.5 text-slate-600">
                                {m.remark || g.remark}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

