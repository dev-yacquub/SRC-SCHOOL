import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { attendanceBatchSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId") ?? "";
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  let uniqueClasses: { id: string; name: string; level: number }[] = [];

  if (user.role === "ADMIN") {
    uniqueClasses = await prisma.schoolClass.findMany({
      orderBy: [{ level: "asc" }, { name: "asc" }],
      select: { id: true, name: true, level: true },
    });
  } else {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.userId },
    });
    if (!teacher) {
      return NextResponse.json({ error: "Teacher profile missing" }, { status: 404 });
    }
    const assignments = await prisma.classSubject.findMany({
      where: { teacherId: teacher.id },
      include: {
        class: { select: { id: true, name: true, level: true } },
      },
      orderBy: [{ class: { level: "asc" } }, { class: { name: "asc" } }],
    });
    uniqueClasses = Array.from(
      new Map(assignments.map((a) => [a.class.id, a.class])).values()
    );
  }

  const allowedClassIds = uniqueClasses.map((c) => c.id);
  const selectedClassId = allowedClassIds.includes(classId)
    ? classId
    : allowedClassIds[0] ?? "";

  if (!selectedClassId) {
    return NextResponse.json({
      classes: [],
      students: [],
      attendance: [],
      alreadyRecorded: false,
      selectedClassId: "",
      date,
    });
  }

  const [students, attendance] = await Promise.all([
    prisma.student.findMany({
      where: { classId: selectedClassId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, admissionNo: true, fullName: true, gender: true },
    }),
    prisma.attendance.findMany({
      where: { classId: selectedClassId, date },
    }),
  ]);

  return NextResponse.json({
    classes: uniqueClasses,
    selectedClassId,
    date,
    students,
    attendance,
    alreadyRecorded: attendance.length > 0,
  });
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = attendanceBatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid attendance data" },
        { status: 400 }
      );
    }

    const { classId, date, records } = parsed.data;

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
        where: { teacherId: teacher.id, classId },
      });
      if (!assigned) {
        return NextResponse.json(
          { error: "You are not assigned to this class" },
          { status: 403 }
        );
      }
    }

    const validStudents = await prisma.student.findMany({
      where: { classId, status: "ACTIVE" },
      select: { id: true },
    });
    const validIds = new Set(validStudents.map((s) => s.id));
    const filteredRecords = records.filter((r) => validIds.has(r.studentId));
    if (filteredRecords.length === 0) {
      return NextResponse.json(
        { error: "No active students from this class in payload" },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      filteredRecords.map((r) =>
        prisma.attendance.upsert({
          where: { studentId_date: { studentId: r.studentId, date } },
          update: {
            status: r.status,
            note: r.note || null,
            classId,
            markedById: user.userId,
          },
          create: {
            studentId: r.studentId,
            classId,
            date,
            status: r.status,
            note: r.note || null,
            markedById: user.userId,
          },
        })
      )
    );

    await logAudit({
      userId: user.userId,
      action: "ATTENDANCE_SAVED",
      entityType: "SchoolClass",
      entityId: classId,
      details: { date, count: filteredRecords.length },
    });

    return NextResponse.json({ saved: filteredRecords.length });
  } catch (err) {
    console.error("Save attendance error:", err);
    return NextResponse.json(
      { error: "Failed to save attendance" },
      { status: 500 }
    );
  }
}
