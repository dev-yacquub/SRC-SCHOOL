import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { parseYearMonth, summarizeAttendance } from "@/lib/domain";

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

  const [students, allRecords] = await Promise.all([
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
  ]);

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
    return {
      studentId: s.id,
      admissionNo: s.admissionNo,
      fullName: s.fullName,
      days,
      summary,
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

