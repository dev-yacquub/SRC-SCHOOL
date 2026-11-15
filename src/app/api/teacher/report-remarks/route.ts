import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { reportRemarksBatchSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = reportRemarksBatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid remarks payload" },
        { status: 400 }
      );
    }

    const { examId, classId, remarks } = parsed.data;
    const isAdmin = user.role === "ADMIN";

    if (!isAdmin) {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: user.userId },
      });
      if (!teacher) {
        return NextResponse.json({ error: "Teacher profile missing" }, { status: 404 });
      }
      const assigned = await prisma.classSubject.findFirst({
        where: { teacherId: teacher.id, classId },
      });
      if (!assigned) {
        return NextResponse.json(
          { error: "You are not assigned to this class" },
          { status: 403 }
        );
      }
    }

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    if (exam.isLocked && !isAdmin) {
      return NextResponse.json(
        { error: "Exam is locked by Admin and remarks cannot be edited" },
        { status: 403 }
      );
    }

    const classStudents = await prisma.student.findMany({
      where: { classId, status: "ACTIVE" },
      select: { id: true },
    });
    const validIds = new Set(classStudents.map((s) => s.id));
    const filtered = remarks.filter((r) => validIds.has(r.studentId));

    await prisma.$transaction(
      filtered.map((r) =>
        prisma.reportRemark.upsert({
          where: { examId_studentId: { examId, studentId: r.studentId } },
          update: {
            teacherRemark: r.teacherRemark || null,
            ...(isAdmin && r.principalRemark !== undefined
              ? { principalRemark: r.principalRemark || null }
              : {}),
            updatedById: user.userId,
          },
          create: {
            examId,
            studentId: r.studentId,
            teacherRemark: r.teacherRemark || null,
            principalRemark: isAdmin ? r.principalRemark || null : null,
            updatedById: user.userId,
          },
        })
      )
    );

    await logAudit({
      userId: user.userId,
      action: "REPORT_REMARKS_SAVED",
      entityType: "Exam",
      entityId: examId,
      details: { classId, count: filtered.length },
    });

    return NextResponse.json({ saved: filtered.length });
  } catch (err) {
    console.error("Save report remarks error:", err);
    return NextResponse.json(
      { error: "Failed to save report card remarks" },
      { status: 500 }
    );
  }
}

