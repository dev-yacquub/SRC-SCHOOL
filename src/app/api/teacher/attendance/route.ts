import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { attendanceBatchSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import {
  getPreviousIsoDate,
  summarizeYesterdayMissingStudents,
} from "@/lib/domain";

export async function GET(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId") ?? "";
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const rawShift = searchParams.get("shift");
  const shift: "SHIFT_A" | "SHIFT_B" =
    rawShift === "SHIFT_B" ? "SHIFT_B" : "SHIFT_A";

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

  const yesterdayDate = getPreviousIsoDate(date);

  if (!selectedClassId) {
    return NextResponse.json({
      classes: [],
      students: [],
      attendance: [],
      alreadyRecorded: false,
      recordedShifts: { SHIFT_A: false, SHIFT_B: false },
      selectedClassId: "",
      date,
      shift,
      yesterday: {
        date: yesterdayDate,
        recorded: false,
        recordedShifts: { SHIFT_A: false, SHIFT_B: false },
        missingStudents: [],
      },
      overview: {
        totalClasses: 0,
        totalStudents: 0,
        doneCount: 0,
        classSummaries: [],
      },
    });
  }

  const [
    students,
    studentCounts,
    allClassesDateAttendance,
    yesterdayClassAttendance,
  ] = await Promise.all([
    prisma.student.findMany({
      where: { classId: selectedClassId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, admissionNo: true, fullName: true, gender: true },
    }),
    prisma.student.groupBy({
      by: ["classId"],
      where: { classId: { in: allowedClassIds }, status: "ACTIVE" },
      _count: { _all: true },
    }),
    prisma.attendance.findMany({
      where: { classId: { in: allowedClassIds }, date },
      select: {
        id: true,
        studentId: true,
        classId: true,
        date: true,
        shift: true,
        status: true,
      },
    }),
    prisma.attendance.findMany({
      where: { classId: selectedClassId, date: yesterdayDate },
      select: {
        studentId: true,
        shift: true,
        status: true,
      },
    }),
  ]);

  const studentCountMap = new Map<string, number>();
  for (const row of studentCounts) {
    studentCountMap.set(row.classId, row._count._all);
  }

  const classAttendanceMap = new Map<
    string,
    typeof allClassesDateAttendance
  >();
  for (const rec of allClassesDateAttendance) {
    const bucket = classAttendanceMap.get(rec.classId);
    if (bucket) {
      bucket.push(rec);
    } else {
      classAttendanceMap.set(rec.classId, [rec]);
    }
  }

  const classSummaries = uniqueClasses.map((cls) => {
    const records = classAttendanceMap.get(cls.id) ?? [];
    const shiftRecords = records.filter(
      (a) => (a.shift ?? "SHIFT_A") === shift
    );
    const presentCount = shiftRecords.filter(
      (a) => a.status !== "ABSENT"
    ).length;
    const absentCount = shiftRecords.filter(
      (a) => a.status === "ABSENT"
    ).length;

    return {
      classId: cls.id,
      name: cls.name,
      level: cls.level,
      studentCount: studentCountMap.get(cls.id) ?? 0,
      recorded: shiftRecords.length > 0,
      presentCount,
      absentCount,
      recordedShifts: {
        SHIFT_A: records.some((a) => (a.shift ?? "SHIFT_A") === "SHIFT_A"),
        SHIFT_B: records.some((a) => a.shift === "SHIFT_B"),
      },
    };
  });

  const allDateAttendance = classAttendanceMap.get(selectedClassId) ?? [];

  const recordedShifts = {
    SHIFT_A: allDateAttendance.some((a) => (a.shift ?? "SHIFT_A") === "SHIFT_A"),
    SHIFT_B: allDateAttendance.some((a) => a.shift === "SHIFT_B"),
  };

  const attendance = allDateAttendance
    .filter((a) => (a.shift ?? "SHIFT_A") === shift)
    .map((a) => ({
      ...a,
      status: a.status === "ABSENT" ? ("ABSENT" as const) : ("PRESENT" as const),
    }));

  const yesterdaySummary = summarizeYesterdayMissingStudents(
    students,
    yesterdayClassAttendance
  );

  return NextResponse.json({
    classes: uniqueClasses,
    selectedClassId,
    date,
    shift,
    students,
    attendance,
    alreadyRecorded: attendance.length > 0,
    recordedShifts,
    yesterday: {
      date: yesterdayDate,
      recorded: yesterdaySummary.recorded,
      recordedShifts: yesterdaySummary.recordedShifts,
      missingStudents: yesterdaySummary.missingStudents,
    },
    overview: {
      totalClasses: uniqueClasses.length,
      totalStudents: classSummaries.reduce((sum, c) => sum + c.studentCount, 0),
      doneCount: classSummaries.filter((c) => c.recorded).length,
      classSummaries,
    },
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

    const { classId, date, shift, records } = parsed.data;

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
          where: {
            studentId_date_shift: { studentId: r.studentId, date, shift },
          },
          update: {
            status: r.status,
            note: null,
            classId,
            shift,
            markedById: user.userId,
          },
          create: {
            studentId: r.studentId,
            classId,
            date,
            shift,
            status: r.status,
            note: null,
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
      details: { date, shift, count: filteredRecords.length },
    });

    return NextResponse.json({ saved: filteredRecords.length, shift });
  } catch (err) {
    console.error("Save attendance error:", err);
    return NextResponse.json(
      { error: "Failed to save attendance" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  try {
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId") ?? "";
    const date = searchParams.get("date") ?? "";
    const rawShift = searchParams.get("shift");
    const shift =
      rawShift === "SHIFT_A" || rawShift === "SHIFT_B" ? rawShift : null;

    if (!classId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Valid classId and date (YYYY-MM-DD) are required" },
        { status: 400 }
      );
    }

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

    const deleted = await prisma.attendance.deleteMany({
      where: {
        classId,
        date,
        ...(shift ? { shift } : {}),
      },
    });

    await logAudit({
      userId: user.userId,
      action: "ATTENDANCE_CLEARED",
      entityType: "SchoolClass",
      entityId: classId,
      details: { date, shift: shift ?? "ALL", deletedCount: deleted.count },
    });

    return NextResponse.json({ deleted: deleted.count });
  } catch (err) {
    console.error("Delete attendance error:", err);
    return NextResponse.json(
      { error: "Failed to clear attendance" },
      { status: 500 }
    );
  }
}
