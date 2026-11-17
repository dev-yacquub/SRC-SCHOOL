import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import {
  getMonthlyAbsenceStats,
  parseYearMonth,
  summarizeAttendance,
} from "@/lib/domain";

export async function GET(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId") ?? "";
  const monthInfo = parseYearMonth(searchParams.get("month"));
  const format = searchParams.get("format");
  const rawShift = searchParams.get("shift");
  const shiftFilter: "ALL" | "SHIFT_A" | "SHIFT_B" =
    rawShift === "SHIFT_A" || rawShift === "SHIFT_B" ? rawShift : "ALL";

  let classes: { id: string; name: string; level: number }[] = [];
  if (user.role === "ADMIN") {
    classes = await prisma.schoolClass.findMany({
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
      include: { class: { select: { id: true, name: true, level: true } } },
      orderBy: [{ class: { level: "asc" } }, { class: { name: "asc" } }],
    });
    classes = Array.from(
      new Map(assignments.map((a) => [a.class.id, a.class])).values()
    );
  }

  const allowedIds = classes.map((c) => c.id);
  const selectedClassId = allowedIds.includes(classId)
    ? classId
    : allowedIds[0] ?? "";

  if (!selectedClassId) {
    return NextResponse.json({
      classes: [],
      selectedClassId: "",
      month: monthInfo.ym,
      monthLabel: monthInfo.label,
      daysInMonth: monthInfo.daysInMonth,
      shift: shiftFilter,
      rows: [],
    });
  }

  const [students, allRecords, punishments] = await Promise.all([
    prisma.student.findMany({
      where: { classId: selectedClassId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, admissionNo: true, fullName: true },
    }),
    prisma.attendance.findMany({
      where: {
        classId: selectedClassId,
        date: { startsWith: `${monthInfo.ym}-` },
      },
      orderBy: [{ date: "asc" }, { shift: "asc" }],
    }),
    prisma.attendancePunishment.findMany({
      where: {
        classId: selectedClassId,
        month: monthInfo.ym,
      },
      select: { studentId: true },
    }),
  ]);

  const punishedStudentIds = new Set(punishments.map((p) => p.studentId));

  const records =
    shiftFilter === "ALL"
      ? allRecords
      : allRecords.filter((r) => (r.shift ?? "SHIFT_A") === shiftFilter);

  const recordsByStudent = new Map<string, typeof records>();
  for (const r of records) {
    const arr = recordsByStudent.get(r.studentId) ?? [];
    arr.push(r);
    recordsByStudent.set(r.studentId, arr);
  }

  type AttendanceStatus = "PRESENT" | "ABSENT";
  type DayCell = {
    status: AttendanceStatus;
    shiftA?: { status: AttendanceStatus };
    shiftB?: { status: AttendanceStatus };
  };

  const normalizeStatus = (s: string): AttendanceStatus =>
    s === "ABSENT" ? "ABSENT" : "PRESENT";

  const rows = students.map((s) => {
    const studentRecs = recordsByStudent.get(s.id) ?? [];
    const days: Record<number, DayCell> = {};
    for (const r of studentRecs) {
      const dayNum = Number(r.date.slice(8, 10));
      if (dayNum >= 1 && dayNum <= monthInfo.daysInMonth) {
        const recStatus = normalizeStatus(r.status);
        const cur: DayCell = days[dayNum] ?? {
          status: recStatus,
        };
        const rShift = r.shift === "SHIFT_B" ? "SHIFT_B" : "SHIFT_A";
        if (rShift === "SHIFT_B") {
          cur.shiftB = { status: recStatus };
        } else {
          cur.shiftA = { status: recStatus };
        }
        // Derive overall day status when both shifts exist
        if (cur.shiftA && cur.shiftB) {
          const statuses = [cur.shiftA.status, cur.shiftB.status];
          cur.status = statuses.includes("ABSENT") ? "ABSENT" : "PRESENT";
        } else {
          cur.status = recStatus;
        }
        days[dayNum] = cur;
      }
    }
    const summary = summarizeAttendance(studentRecs);
    const absenceStats = getMonthlyAbsenceStats(studentRecs);
    const isPunished = punishedStudentIds.has(s.id);
    const needsPunishmentHighlight =
      absenceStats.meetsAbsenceThreshold && !isPunished;
    return {
      studentId: s.id,
      admissionNo: s.admissionNo,
      fullName: s.fullName,
      days,
      summary,
      absentDays: absenceStats.absentDays,
      absentShifts: absenceStats.absentShifts,
      meetsAbsenceThreshold: absenceStats.meetsAbsenceThreshold,
      isPunished,
      needsPunishmentHighlight,
    };
  });

  if (format === "xlsx") {
    const clsName =
      classes.find((c) => c.id === selectedClassId)?.name ?? "Class";
    const workbook = new ExcelJS.Workbook();
    const sheetTitle =
      shiftFilter === "SHIFT_A"
        ? "Monthly Attendance (Shift A)"
        : shiftFilter === "SHIFT_B"
          ? "Monthly Attendance (Shift B)"
          : "Monthly Attendance (A & B)";
    const sheet = workbook.addWorksheet(sheetTitle);

    const cols: Partial<ExcelJS.Column>[] = [
      { header: "Admission No", key: "admissionNo", width: 16 },
      { header: "Student Name", key: "fullName", width: 24 },
    ];
    for (let d = 1; d <= monthInfo.daysInMonth; d++) {
      cols.push({
        header: String(d),
        key: `d${d}`,
        width: shiftFilter === "ALL" ? 6 : 4,
      });
    }
    cols.push(
      { header: "Present", key: "present", width: 9 },
      { header: "Absent", key: "absent", width: 8 },
      { header: "Rate %", key: "rate", width: 9 }
    );
    sheet.columns = cols;
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
      const obj: Record<string, string | number> = {
        admissionNo: row.admissionNo,
        fullName: row.fullName,
        present: row.summary.present,
        absent: row.summary.absent,
        rate: row.summary.total > 0 ? `${row.summary.ratePercent}%` : "—",
      };
      for (let d = 1; d <= monthInfo.daysInMonth; d++) {
        const entry = row.days[d];
        if (!entry) {
          obj[`d${d}`] = "";
        } else if (shiftFilter === "ALL") {
          const aChar = entry.shiftA ? entry.shiftA.status.slice(0, 1) : "-";
          const bChar = entry.shiftB ? entry.shiftB.status.slice(0, 1) : "-";
          obj[`d${d}`] =
            entry.shiftA && entry.shiftB
              ? `${aChar}/${bChar}`
              : entry.shiftA
                ? `${aChar}/-`
                : `-/${bChar}`;
        } else {
          obj[`d${d}`] = entry.status.slice(0, 1);
        }
      }
      sheet.addRow(obj);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = `${clsName}_${monthInfo.ym}_${shiftFilter.toLowerCase()}_attendance.xlsx`.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeName}"`,
      },
    });
  }

  return NextResponse.json({
    classes,
    selectedClassId,
    month: monthInfo.ym,
    monthLabel: monthInfo.label,
    daysInMonth: monthInfo.daysInMonth,
    shift: shiftFilter,
    rows,
  });
}

const punishSchema = z.object({
  studentId: z.string().min(1),
  classId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = punishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "studentId, classId, and month (YYYY-MM) are required" },
      { status: 400 }
    );
  }

  const { studentId, classId, month } = parsed.data;
  const monthInfo = parseYearMonth(month);

  if (user.role === "TEACHER") {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.userId },
      select: { id: true },
    });
    if (!teacher) {
      return NextResponse.json({ error: "Teacher profile missing" }, { status: 404 });
    }
    const assignment = await prisma.classSubject.findFirst({
      where: { teacherId: teacher.id, classId },
      select: { id: true },
    });
    if (!assignment) {
      return NextResponse.json(
        { error: "You are not assigned to this class" },
        { status: 403 }
      );
    }
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, classId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found in this class" }, { status: 404 });
  }

  await prisma.attendancePunishment.upsert({
    where: {
      studentId_month: {
        studentId,
        month: monthInfo.ym,
      },
    },
    update: {
      classId,
      punishedById: user.userId,
      punishedAt: new Date(),
    },
    create: {
      studentId,
      classId,
      month: monthInfo.ym,
      punishedById: user.userId,
    },
  });

  return NextResponse.json({
    ok: true,
    studentId,
    classId,
    month: monthInfo.ym,
    isPunished: true,
  });
}

