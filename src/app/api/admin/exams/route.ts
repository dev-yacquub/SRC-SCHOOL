import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { examCreateSchema, gradeScaleUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { error } = await requireApiRole(["ADMIN"]);
  if (error) return error;

  const [exams, terms, gradeScales, classes, classSubjects, activeStudentCounts] =
    await Promise.all([
      prisma.exam.findMany({
        include: {
          term: { include: { academicYear: { select: { name: true } } } },
          _count: { select: { marks: true } },
        },
        orderBy: [{ term: { startDate: "asc" } }, { createdAt: "desc" }],
      }),
      prisma.term.findMany({
        include: { academicYear: { select: { name: true } } },
        orderBy: { startDate: "asc" },
      }),
      prisma.gradeScale.findMany({ orderBy: { minScore: "desc" } }),
      prisma.schoolClass.findMany({ orderBy: { level: "asc" } }),
      prisma.classSubject.findMany({
        include: {
          class: { select: { name: true } },
          subject: { select: { name: true } },
          teacher: { select: { fullName: true } },
        },
      }),
      prisma.student.groupBy({
        by: ["classId"],
        where: { status: "ACTIVE" },
        _count: { _all: true },
      }),
    ]);

  const countMap = new Map<string, number>();
  for (const row of activeStudentCounts) {
    countMap.set(row.classId, row._count._all);
  }

  // Marks completion per exam x classSubject
  const markCounts = await prisma.mark.groupBy({
    by: ["examId", "classId", "subjectId"],
    _count: { _all: true },
  });

  const markMap = new Map<string, number>();
  for (const m of markCounts) {
    markMap.set(`${m.examId}:${m.classId}:${m.subjectId}`, m._count._all);
  }

  const completion = exams.map((exam) => ({
    examId: exam.id,
    items: classSubjects.map((cs) => {
      const expected = countMap.get(cs.classId) ?? 0;
      const entered = markMap.get(`${exam.id}:${cs.classId}:${cs.subjectId}`) ?? 0;
      return {
        className: cs.class.name,
        subjectName: cs.subject.name,
        teacherName: cs.teacher.fullName,
        expected,
        entered,
      };
    }),
  }));

  return NextResponse.json({
    exams,
    terms,
    gradeScales,
    classes,
    completion,
  });
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["ADMIN"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const action = body?.action as string | undefined;

    if (action === "createExam") {
      const parsed = examCreateSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid exam" },
          { status: 400 }
        );
      }
      const exam = await prisma.exam.create({ data: parsed.data });
      await logAudit({
        userId: user.userId,
        action: "EXAM_CREATED",
        entityType: "Exam",
        entityId: exam.id,
        details: parsed.data,
      });
      return NextResponse.json({ id: exam.id }, { status: 201 });
    }

    if (action === "toggleExamState") {
      const { examId, isLocked, isPublished } = body.data ?? {};
      const existing = await prisma.exam.findUnique({ where: { id: examId } });
      if (!existing) {
        return NextResponse.json({ error: "Exam not found" }, { status: 404 });
      }
      const nextPublished =
        isPublished !== undefined ? Boolean(isPublished) : existing.isPublished;
      const nextLocked =
        nextPublished ? true : isLocked !== undefined ? Boolean(isLocked) : existing.isLocked;

      await prisma.exam.update({
        where: { id: examId },
        data: { isLocked: nextLocked, isPublished: nextPublished },
      });

      await logAudit({
        userId: user.userId,
        action: nextPublished ? "EXAM_PUBLISHED" : "EXAM_STATE_UPDATED",
        entityType: "Exam",
        entityId: examId,
        details: { isLocked: nextLocked, isPublished: nextPublished },
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "updateGradeScale") {
      const parsed = gradeScaleUpdateSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid grade scale" },
          { status: 400 }
        );
      }
      await prisma.$transaction(async (tx) => {
        await tx.gradeScale.deleteMany();
        await tx.gradeScale.createMany({ data: parsed.data.scales });
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    console.error("Exams POST error:", err);
    return NextResponse.json({ error: "Failed to save exam changes" }, { status: 400 });
  }
}

