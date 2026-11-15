import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

async function assertTeacherScope(
  user: { userId: string; role: string },
  classId: string,
  subjectId: string
) {
  if (user.role === "ADMIN") return null;
  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.userId },
  });
  if (!teacher) {
    return NextResponse.json({ error: "Teacher profile missing" }, { status: 404 });
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
  return null;
}

export async function GET(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  const { searchParams } = new URL(req.url);
  const examId = searchParams.get("examId") ?? "";
  const classId = searchParams.get("classId") ?? "";
  const subjectId = searchParams.get("subjectId") ?? "";

  if (!examId || !classId || !subjectId) {
    return NextResponse.json(
      { error: "Missing examId, classId, or subjectId" },
      { status: 400 }
    );
  }

  const scopeErr = await assertTeacherScope(user, classId, subjectId);
  if (scopeErr) return scopeErr;

  const [exam, cls, subject, students, marks] = await Promise.all([
    prisma.exam.findUnique({ where: { id: examId } }),
    prisma.schoolClass.findUnique({ where: { id: classId } }),
    prisma.subject.findUnique({ where: { id: subjectId } }),
    prisma.student.findMany({
      where: { classId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, admissionNo: true, fullName: true },
    }),
    prisma.mark.findMany({
      where: { examId, classId, subjectId },
    }),
  ]);

  if (!exam || !cls || !subject) {
    return NextResponse.json(
      { error: "Exam, class, or subject not found" },
      { status: 404 }
    );
  }

  const markMap = new Map(marks.map((m) => [m.studentId, m]));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Marks");
  sheet.columns = [
    { header: "Admission No", key: "admissionNo", width: 16 },
    { header: "Student Name", key: "fullName", width: 26 },
    { header: `Score (0 - ${exam.maxMarks})`, key: "score", width: 16 },
    { header: "Remark (Optional)", key: "remark", width: 28 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const s of students) {
    const m = markMap.get(s.id);
    sheet.addRow({
      admissionNo: s.admissionNo,
      fullName: s.fullName,
      score: m ? m.score : "",
      remark: m?.remark ?? "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${cls.name}_${subject.code}_${exam.name}_marks.xlsx`.replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  try {
    const formData = await req.formData();
    const examId = String(formData.get("examId") ?? "");
    const classId = String(formData.get("classId") ?? "");
    const subjectId = String(formData.get("subjectId") ?? "");
    const file = formData.get("file");

    if (!examId || !classId || !subjectId || !file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Provide examId, classId, subjectId, and an Excel (.xlsx) file" },
        { status: 400 }
      );
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Only .xlsx Excel files are supported" },
        { status: 400 }
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Excel file must be 5 MB or smaller" },
        { status: 400 }
      );
    }

    const scopeErr = await assertTeacherScope(user, classId, subjectId);
    if (scopeErr) return scopeErr;

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    if (exam.isLocked && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Exam marks are locked by Admin and cannot be modified" },
        { status: 403 }
      );
    }

    const students = await prisma.student.findMany({
      where: { classId, status: "ACTIVE" },
      select: { id: true, admissionNo: true },
    });
    const byAdm = new Map(
      students.map((s) => [s.admissionNo.trim().toLowerCase(), s.id])
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json(
        { error: "No worksheet found in uploaded file" },
        { status: 400 }
      );
    }
    if (sheet.rowCount > 501) {
      return NextResponse.json(
        { error: "Marks spreadsheet exceeds maximum of 500 student rows" },
        { status: 400 }
      );
    }

    const entries: { studentId: string; score: number; remark: string }[] = [];
    const errors: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const admRaw = String(row.getCell(1).value ?? "").trim();
      const scoreRaw = row.getCell(3).value;
      if (!admRaw) return;
      if (scoreRaw === null || scoreRaw === undefined || String(scoreRaw).trim() === "") {
        return;
      }

      const studentId = byAdm.get(admRaw.toLowerCase());
      if (!studentId) {
        errors.push(`Row ${rowNumber}: Student "${admRaw}" is not active in this class.`);
        return;
      }

      const score = Number(scoreRaw);
      if (Number.isNaN(score) || score < 0 || score > exam.maxMarks) {
        errors.push(
          `Row ${rowNumber} (${admRaw}): Score must be between 0 and ${exam.maxMarks}.`
        );
        return;
      }

      const remark = String(row.getCell(4).value ?? "").trim().slice(0, 120);
      entries.push({ studentId, score, remark });
    });

    if (entries.length === 0) {
      return NextResponse.json(
        { error: errors[0] ?? "No valid scores found in spreadsheet", errors },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      entries.map((e) =>
        prisma.mark.upsert({
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
        })
      )
    );

    await logAudit({
      userId: user.userId,
      action: "MARKS_EXCEL_IMPORTED",
      entityType: "Exam",
      entityId: examId,
      details: { classId, subjectId, count: entries.length },
    });

    return NextResponse.json({ saved: entries.length, errors });
  } catch (err) {
    console.error("Import marks Excel error:", err);
    return NextResponse.json(
      { error: "Failed to import marks spreadsheet" },
      { status: 500 }
    );
  }
}

