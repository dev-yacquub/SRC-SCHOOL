import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { marksBatchSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  let teacherIdFilter: string | undefined;
  if (user.role !== "ADMIN") {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.userId },
    });
    if (!teacher) {
      return NextResponse.json({ error: "Teacher profile missing" }, { status: 404 });
    }
    teacherIdFilter = teacher.id;
  }

  const { searchParams } = new URL(req.url);
  const examId = searchParams.get("examId") ?? "";
  const classId = searchParams.get("classId") ?? "";
  const subjectId = searchParams.get("subjectId") ?? "";

  const [exams, assignments, gradeScales] = await Promise.all([
    prisma.exam.findMany({
      include: { term: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.classSubject.findMany({
      where: teacherIdFilter ? { teacherId: teacherIdFilter } : undefined,
      include: {
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ class: { level: "asc" } }, { subject: { name: "asc" } }],
    }),
    prisma.gradeScale.findMany({ orderBy: { minScore: "desc" } }),
  ]);

  const selectedExam = exams.find((e) => e.id === examId) ?? exams[0] ?? null;
  const selectedAssignment =
    assignments.find(
      (a) => a.classId === classId && a.subjectId === subjectId
    ) ??
    (classId
      ? assignments.find((a) => a.classId === classId)
      : undefined) ??
    (subjectId
      ? assignments.find((a) => a.subjectId === subjectId)
      : undefined) ??
    assignments[0] ??
    null;

  if (!selectedExam || !selectedAssignment) {
    return NextResponse.json({
      exams,
      assignments,
      gradeScales,
      selectedExam,
      selectedAssignment,
      students: [],
      marks: [],
      isAdmin: user.role === "ADMIN",
    });
  }

  const [students, marks] = await Promise.all([
    prisma.student.findMany({
      where: { classId: selectedAssignment.classId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, admissionNo: true, fullName: true },
    }),
    prisma.mark.findMany({
      where: {
        examId: selectedExam.id,
        classId: selectedAssignment.classId,
        subjectId: selectedAssignment.subjectId,
      },
    }),
  ]);

  return NextResponse.json({
    exams,
    assignments,
    gradeScales,
    selectedExam,
    selectedAssignment,
    students,
    marks,
    isAdmin: user.role === "ADMIN",
  });
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = marksBatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid marks payload" },
        { status: 400 }
      );
    }

    const { examId, classId, subjectId, entries, clearStudentIds } = parsed.data;

    if (user.role !== "ADMIN") {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: user.userId },
      });
      if (!teacher) {
        return NextResponse.json(
          { error: "Teacher profile missing" },
          { status: 404 }
        );
      }
      const assigned = await prisma.classSubject.findFirst({
        where: { teacherId: teacher.id, classId, subjectId },
      });
      if (!assigned) {
        return NextResponse.json(
          { error: "You are not assigned to this class and subject" },
          { status: 403 }
        );
      }
    }

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    if (exam.isLocked && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Exam marks are locked by Admin and cannot be edited" },
        { status: 403 }
      );
    }

    const classStudents = await prisma.student.findMany({
      where: { classId, status: "ACTIVE" },
      select: { id: true },
    });
    const classStudentIds = new Set(classStudents.map((s) => s.id));
    const validEntries = entries.filter((e) => classStudentIds.has(e.studentId));
    const validClearIds = (clearStudentIds ?? []).filter((sid) =>
      classStudentIds.has(sid)
    );

    if (validEntries.length === 0 && validClearIds.length === 0) {
      return NextResponse.json(
        { error: "No valid student entries for this class" },
        { status: 400 }
      );
    }

    for (const entry of validEntries) {
      if (entry.score < 0 || entry.score > exam.maxMarks) {
        return NextResponse.json(
          { error: `Score must be between 0 and ${exam.maxMarks}` },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const e of validEntries) {
        await tx.mark.upsert({
          where: {
            examId_studentId_subjectId: {
              examId,
              studentId: e.studentId,
              subjectId,
            },
          },
          update: {
            score: e.score,
            remark: e.remark || null,
            classId,
            enteredById: user.userId,
          },
          create: {
            examId,
            studentId: e.studentId,
            subjectId,
            classId,
            score: e.score,
            remark: e.remark || null,
            enteredById: user.userId,
          },
        });
      }

      if (validClearIds.length > 0) {
        await tx.mark.deleteMany({
          where: {
            examId,
            classId,
            subjectId,
            studentId: { in: validClearIds },
          },
        });
      }
    });

    await logAudit({
      userId: user.userId,
      action: "MARKS_SAVED",
      entityType: "Exam",
      entityId: examId,
      details: {
        classId,
        subjectId,
        savedCount: validEntries.length,
        clearedCount: validClearIds.length,
      },
    });

    return NextResponse.json({
      saved: validEntries.length,
      cleared: validClearIds.length,
    });
  } catch (err) {
    console.error("Save marks error:", err);
    return NextResponse.json({ error: "Failed to save marks" }, { status: 500 });
  }
}
