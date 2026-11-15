import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { promoteStudentsSchema } from "@/lib/validation";
import { summarizeAttendance } from "@/lib/domain";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const { error } = await requireApiRole(["ADMISSION", "ADMIN"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId") ?? "";
  if (!classId) {
    return NextResponse.json({ students: [], latestExamName: null });
  }

  const [students, latestExam] = await Promise.all([
    prisma.student.findMany({
      where: { classId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      include: {
        attendance: { select: { status: true } },
      },
    }),
    prisma.exam.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, maxMarks: true },
    }),
  ]);

  const marksByStudent = new Map<string, number[]>();
  if (latestExam) {
    const marks = await prisma.mark.findMany({
      where: { examId: latestExam.id, classId },
      select: { studentId: true, score: true },
    });
    for (const m of marks) {
      const list = marksByStudent.get(m.studentId) ?? [];
      list.push(m.score);
      marksByStudent.set(m.studentId, list);
    }
  }

  const enriched = students.map((s) => {
    const att = summarizeAttendance(s.attendance);
    const scores = marksByStudent.get(s.id) ?? [];
    const examAvgPercent =
      latestExam && scores.length > 0 && latestExam.maxMarks > 0
        ? Math.round(
            ((scores.reduce((sum, v) => sum + v, 0) /
              (scores.length * latestExam.maxMarks)) *
              100) *
              10
          ) / 10
        : null;

    return {
      id: s.id,
      admissionNo: s.admissionNo,
      fullName: s.fullName,
      gender: s.gender,
      attendanceRate: att.total > 0 ? att.ratePercent : null,
      attendanceTotal: att.total,
      examAvgPercent,
    };
  });

  return NextResponse.json({
    students: enriched,
    latestExamName: latestExam?.name ?? null,
  });
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["ADMISSION", "ADMIN"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = promoteStudentsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid promotion payload" },
        { status: 400 }
      );
    }

    const { studentIds, targetClassId, markGraduated, note } = parsed.data;

    if (!markGraduated && !targetClassId) {
      return NextResponse.json(
        { error: "Select a destination class or choose Graduate" },
        { status: 400 }
      );
    }

    const existingStudents = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, classId: true, class: { select: { academicYearId: true } } },
    });
    if (existingStudents.length === 0) {
      return NextResponse.json({ error: "No matching students found" }, { status: 404 });
    }

    let destinationClass: { id: string; name: string; academicYearId: string } | null =
      null;
    if (!markGraduated && targetClassId) {
      destinationClass = await prisma.schoolClass.findUnique({
        where: { id: targetClassId },
        select: { id: true, name: true, academicYearId: true },
      });
      if (!destinationClass) {
        return NextResponse.json(
          { error: "Destination class not found" },
          { status: 404 }
        );
      }
      if (existingStudents.every((s) => s.classId === destinationClass!.id)) {
        return NextResponse.json(
          { error: "Destination class must be different from the current class" },
          { status: 400 }
        );
      }
    }

    const updatedCount = await prisma.$transaction(async (tx) => {
      if (markGraduated) {
        const res = await tx.student.updateMany({
          where: { id: { in: studentIds } },
          data: {
            status: "GRADUATED",
            statusReason: note || "Graduated",
            statusUpdatedAt: new Date(),
          },
        });
        await tx.enrollment.createMany({
          data: existingStudents.map((s) => ({
            studentId: s.id,
            classId: s.classId,
            academicYearId: s.class.academicYearId,
            status: "GRADUATED",
            note: note || "Graduated",
          })),
        });
        return res.count;
      }

      const res = await tx.student.updateMany({
        where: { id: { in: studentIds } },
        data: {
          classId: destinationClass!.id,
          status: "ACTIVE",
          statusReason: null,
          statusUpdatedAt: new Date(),
        },
      });
      await tx.enrollment.createMany({
        data: existingStudents.map((s) => ({
          studentId: s.id,
          classId: destinationClass!.id,
          academicYearId: destinationClass!.academicYearId,
          status: "ACTIVE",
          note: note || `Promoted to ${destinationClass!.name}`,
        })),
      });
      return res.count;
    });

    await logAudit({
      userId: user.userId,
      action: markGraduated ? "STUDENTS_GRADUATED" : "STUDENTS_PROMOTED",
      entityType: "Student",
      entityId: markGraduated ? "GRADUATED" : destinationClass!.id,
      details: { count: updatedCount, studentIds, note: note || null },
    });

    return NextResponse.json({ updatedCount });
  } catch (err) {
    console.error("Promote students error:", err);
    return NextResponse.json(
      { error: "Failed to promote students" },
      { status: 500 }
    );
  }
}
