import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import {
  calculateLetterGrade,
  computeClassRankings,
  getOrdinalSuffix,
} from "@/lib/domain";

export async function GET(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  const { searchParams } = new URL(req.url);
  const classIdParam = searchParams.get("classId") ?? "";
  const examIdParam = searchParams.get("examId") ?? "";
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

  const exams = await prisma.exam.findMany({
    include: { term: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const allowedClassIds = classes.map((c) => c.id);
  const selectedClassId = allowedClassIds.includes(classIdParam)
    ? classIdParam
    : allowedClassIds[0] ?? "";
  const selectedExam = exams.find((e) => e.id === examIdParam) ?? exams[0] ?? null;

  if (!selectedClassId || !selectedExam) {
    return NextResponse.json({
      classes,
      exams,
      selectedClassId,
      selectedExam,
      subjects: [],
      rows: [],
      classAveragePercent: 0,
      isAdmin: user.role === "ADMIN",
    });
  }

  const [classSubjects, students, marks, scales, remarks] = await Promise.all([
    prisma.classSubject.findMany({
      where: { classId: selectedClassId },
      include: { subject: { select: { id: true, name: true, code: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
    prisma.student.findMany({
      where: { classId: selectedClassId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, admissionNo: true, fullName: true },
    }),
    prisma.mark.findMany({
      where: { examId: selectedExam.id, classId: selectedClassId },
    }),
    prisma.gradeScale.findMany({ orderBy: { minScore: "desc" } }),
    prisma.reportRemark.findMany({
      where: {
        examId: selectedExam.id,
        student: { classId: selectedClassId },
      },
    }),
  ]);

  const subjects = classSubjects.map((cs) => cs.subject);
  const markLookup = new Map<string, number>();
  for (const m of marks) {
    markLookup.set(`${m.studentId}:${m.subjectId}`, m.score);
  }
  const remarkLookup = new Map(remarks.map((r) => [r.studentId, r]));

  const rankingInputs: {
    studentId: string;
    totalObtained: number;
    totalMax: number;
  }[] = [];

  for (const s of students) {
    const stuMarks = marks.filter((m) => m.studentId === s.id);
    if (stuMarks.length > 0) {
      rankingInputs.push({
        studentId: s.id,
        totalObtained: stuMarks.reduce((acc, m) => acc + m.score, 0),
        totalMax: stuMarks.length * selectedExam.maxMarks,
      });
    }
  }

  const rankings = computeClassRankings(rankingInputs);
  const rankByStudent = new Map(rankings.map((r) => [r.studentId, r]));
  const classAveragePercent = rankings[0]?.classAveragePercent ?? 0;

  const rows = students.map((s) => {
    const subjectScores: Record<string, number | null> = {};
    let totalObtained = 0;
    let gradedSubjects = 0;
    for (const sub of subjects) {
      const val = markLookup.get(`${s.id}:${sub.id}`);
      if (val !== undefined) {
        subjectScores[sub.id] = val;
        totalObtained += val;
        gradedSubjects++;
      } else {
        subjectScores[sub.id] = null;
      }
    }
    const totalMax = gradedSubjects * selectedExam.maxMarks;
    const overall =
      totalMax > 0
        ? calculateLetterGrade(totalObtained, totalMax, scales)
        : null;
    const rankInfo = rankByStudent.get(s.id) ?? null;
    const rem = remarkLookup.get(s.id);

    return {
      studentId: s.id,
      admissionNo: s.admissionNo,
      fullName: s.fullName,
      subjectScores,
      totalObtained,
      totalMax,
      percentage: overall?.percentage ?? null,
      grade: overall?.grade ?? null,
      rank: rankInfo?.rank ?? null,
      outOf: rankInfo?.outOf ?? 0,
      teacherRemark: rem?.teacherRemark ?? "",
      principalRemark: rem?.principalRemark ?? "",
    };
  });

  if (format === "xlsx") {
    const clsName = classes.find((c) => c.id === selectedClassId)?.name ?? "Class";
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Broadsheet");

    const cols: Partial<ExcelJS.Column>[] = [
      { header: "Rank", key: "rank", width: 8 },
      { header: "Admission No", key: "admissionNo", width: 16 },
      { header: "Student Name", key: "fullName", width: 25 },
    ];
    for (const sub of subjects) {
      cols.push({ header: sub.code, key: `sub_${sub.id}`, width: 10 });
    }
    cols.push(
      { header: "Total", key: "total", width: 10 },
      { header: "Max", key: "max", width: 10 },
      { header: "Avg %", key: "avg", width: 10 },
      { header: "Grade", key: "grade", width: 8 },
      { header: "Teacher Remark", key: "teacherRemark", width: 28 },
      { header: "Principal Remark", key: "principalRemark", width: 28 }
    );
    sheet.columns = cols;
    sheet.getRow(1).font = { bold: true };

    const sorted = [...rows].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
    for (const r of sorted) {
      const obj: Record<string, string | number> = {
        rank: r.rank ? getOrdinalSuffix(r.rank) : "—",
        admissionNo: r.admissionNo,
        fullName: r.fullName,
        total: r.totalObtained,
        max: r.totalMax,
        avg: r.percentage !== null ? `${r.percentage}%` : "—",
        grade: r.grade ?? "—",
        teacherRemark: r.teacherRemark,
        principalRemark: r.principalRemark,
      };
      for (const sub of subjects) {
        const sc = r.subjectScores[sub.id];
        obj[`sub_${sub.id}`] = sc !== null ? sc : "";
      }
      sheet.addRow(obj);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${clsName}_${selectedExam.name}_broadsheet.xlsx`.replace(
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

  return NextResponse.json({
    classes,
    exams,
    selectedClassId,
    selectedExam,
    subjects,
    rows,
    classAveragePercent,
    isAdmin: user.role === "ADMIN",
  });
}

