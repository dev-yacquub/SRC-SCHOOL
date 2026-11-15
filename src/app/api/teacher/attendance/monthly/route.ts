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
      rows: [],
    });
  }

  const [students, records] = await Promise.all([
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
      orderBy: { date: "asc" },
    }),
  ]);

  const recordsByStudent = new Map<string, typeof records>();
  for (const r of records) {
    const arr = recordsByStudent.get(r.studentId) ?? [];
    arr.push(r);
    recordsByStudent.set(r.studentId, arr);
  }

  const rows = students.map((s) => {
    const studentRecs = recordsByStudent.get(s.id) ?? [];
    const days: Record<number, { status: "PRESENT" | "ABSENT" | "LATE"; note: string | null }> =
      {};
    for (const r of studentRecs) {
      const dayNum = Number(r.date.slice(8, 10));
      if (dayNum >= 1 && dayNum <= monthInfo.daysInMonth) {
        days[dayNum] = { status: r.status, note: r.note };
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
    const sheet = workbook.addWorksheet("Monthly Attendance");

    const cols: Partial<ExcelJS.Column>[] = [
      { header: "Admission No", key: "admissionNo", width: 16 },
      { header: "Student Name", key: "fullName", width: 24 },
    ];
    for (let d = 1; d <= monthInfo.daysInMonth; d++) {
      cols.push({ header: String(d), key: `d${d}`, width: 4 });
    }
    cols.push(
      { header: "Present", key: "present", width: 9 },
      { header: "Late", key: "late", width: 8 },
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
        late: row.summary.late,
        absent: row.summary.absent,
        rate: row.summary.total > 0 ? `${row.summary.ratePercent}%` : "—",
      };
      for (let d = 1; d <= monthInfo.daysInMonth; d++) {
        const entry = row.days[d];
        obj[`d${d}`] = entry ? entry.status.slice(0, 1) : "";
      }
      sheet.addRow(obj);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = `${clsName}_${monthInfo.ym}_attendance.xlsx`.replace(
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
    rows,
  });
}

