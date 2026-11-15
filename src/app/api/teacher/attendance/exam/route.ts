import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { examAttendanceBatchSchema } from "@/lib/validation";
import { buildExamSubjectSummaries } from "@/lib/domain";
import { logAudit } from "@/lib/audit";

type ClassMeta = { id: string; name: string; level: number };
type SubjectMeta = { id: string; name: string; code: string };

async function getAuthorizedClassesForUser(user: {
  userId: string;
  role: string;
}): Promise<{ classes: ClassMeta[]; errorResponse?: NextResponse }> {
  if (user.role === "ADMIN") {
    const classes = await prisma.schoolClass.findMany({
      orderBy: [{ level: "asc" }, { name: "asc" }],
      select: { id: true, name: true, level: true },
    });
    return { classes };
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.userId },
  });
  if (!teacher) {
    return {
      classes: [],
      errorResponse: NextResponse.json(
        { error: "Teacher profile missing" },
        { status: 404 }
      ),
    };
  }

  const assignments = await prisma.classSubject.findMany({
    where: { teacherId: teacher.id },
    include: {
      class: { select: { id: true, name: true, level: true } },
    },
    orderBy: [{ class: { level: "asc" } }, { class: { name: "asc" } }],
  });
  const classes = Array.from(
    new Map(
      assignments.flatMap((a) => (a.class ? [[a.class.id, a.class] as const] : []))
    ).values()
  );
  return { classes };
}

async function verifyClassWriteAccess(
  user: { userId: string; role: string },
  classId: string
): Promise<NextResponse | null> {
  if (user.role === "ADMIN") return null;

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
  return null;
}

async function getSubjectsForClass(
  classId: string,
  allowSchoolFallback: boolean
): Promise<SubjectMeta[]> {
  const classSubjects = await prisma.classSubject.findMany({
    where: { classId },
    include: { subject: { select: { id: true, name: true, code: true } } },
    orderBy: { subject: { name: "asc" } },
  });

  const unique = Array.from(
    new Map(
      classSubjects.flatMap((cs) =>
        cs.subject ? [[cs.subject.id, cs.subject] as const] : []
      )
    ).values()
  );
  if (unique.length > 0 || !allowSchoolFallback) {
    return unique;
  }

  return prisma.subject.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });
}

export async function GET(req: Request) {
  try {
    return await handleGet(req);
  } catch (err) {
    console.error("[GET /api/teacher/attendance/exam] failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load exam attendance",
      },
      { status: 500 }
    );
  }
}

async function handleGet(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  const { searchParams } = new URL(req.url);
  const classIdParam = searchParams.get("classId") ?? "";
  const rawDate = searchParams.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : new Date().toISOString().slice(0, 10);
  const examIdParam = searchParams.get("examId") ?? "";
  const format = searchParams.get("format");
  const subjectIdsParam = searchParams.get("subjectIds") ?? "";

  const [{ classes, errorResponse }, exams] = await Promise.all([
    getAuthorizedClassesForUser(user),
    prisma.exam.findMany({
      include: { term: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (errorResponse) return errorResponse;

  const allowedClassIds = classes.map((c) => c.id);
  const selectedClassId = allowedClassIds.includes(classIdParam)
    ? classIdParam
    : allowedClassIds[0] ?? "";
  const selectedExamId = exams.some((e) => e.id === examIdParam)
    ? examIdParam
    : "";

  if (!selectedClassId) {
    return NextResponse.json({
      classes: [],
      exams,
      subjects: [],
      selectedClassId: "",
      selectedExamId,
      date,
      students: [],
      records: [],
      recordedSubjects: [],
    });
  }

  const [subjects, students, rawRecords] = await Promise.all([
    getSubjectsForClass(selectedClassId, user.role === "ADMIN"),
    prisma.student.findMany({
      where: { classId: selectedClassId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, admissionNo: true, fullName: true, gender: true },
    }),
    prisma.examAttendance.findMany({
      where: {
        classId: selectedClassId,
        date,
        examKey: selectedExamId,
      },
      select: {
        id: true,
        studentId: true,
        subjectId: true,
        status: true,
        note: true,
      },
    }),
  ]);

  const records = rawRecords.map((r) => ({
    ...r,
    status: r.status === "ABSENT" ? ("ABSENT" as const) : ("PRESENT" as const),
  }));
  const recordedSubjects = buildExamSubjectSummaries(subjects, records);

  if (format === "xlsx") {
    const requestedSubjectIds = subjectIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const requestedSet = new Set(requestedSubjectIds);
    const exportSubjects =
      requestedSet.size > 0
        ? subjects.filter((s) => requestedSet.has(s.id))
        : recordedSubjects.length > 0
          ? subjects.filter((s) =>
              recordedSubjects.some((rs) => rs.subjectId === s.id)
            )
          : subjects;

    const statusLookup = new Map<string, "PRESENT" | "ABSENT">();
    for (const r of records) {
      statusLookup.set(`${r.studentId}:${r.subjectId}`, r.status);
    }

    const clsName =
      classes.find((c) => c.id === selectedClassId)?.name ?? "Class";
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Exam Attendance");

    const cols: Partial<ExcelJS.Column>[] = [
      { header: "Admission No", key: "admissionNo", width: 16 },
      { header: "Student Name", key: "fullName", width: 24 },
      ...exportSubjects.map((s) => ({
        header: `${s.name} (${s.code})`,
        key: `subj_${s.id}`,
        width: 18,
      })),
      { header: "Present", key: "present", width: 10 },
      { header: "Absent", key: "absent", width: 10 },
    ];
    sheet.columns = cols;
    sheet.getRow(1).font = { bold: true };

    for (const st of students) {
      const row: Record<string, string | number> = {
        admissionNo: st.admissionNo,
        fullName: st.fullName,
      };
      let present = 0;
      let absent = 0;
      for (const s of exportSubjects) {
        const val = statusLookup.get(`${st.id}:${s.id}`);
        if (val === "PRESENT") {
          row[`subj_${s.id}`] = "P";
          present += 1;
        } else if (val === "ABSENT") {
          row[`subj_${s.id}`] = "A";
          absent += 1;
        } else {
          row[`subj_${s.id}`] = "—";
        }
      }
      row.present = present;
      row.absent = absent;
      sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = `${clsName}_${date}_exam_attendance.xlsx`.replace(
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
    exams,
    subjects,
    selectedClassId,
    selectedExamId,
    date,
    students,
    records,
    recordedSubjects,
  });
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = examAttendanceBatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid exam attendance data",
        },
        { status: 400 }
      );
    }

    const { classId, examId, date, subjectIds, records } = parsed.data;
    const accessErr = await verifyClassWriteAccess(user, classId);
    if (accessErr) return accessErr;

    const normalizedExamId = examId?.trim() || null;
    const examKey = normalizedExamId ?? "";
    if (normalizedExamId) {
      const exam = await prisma.exam.findUnique({
        where: { id: normalizedExamId },
      });
      if (!exam) {
        return NextResponse.json({ error: "Exam not found" }, { status: 404 });
      }
    }

    const allowedSubjects = await getSubjectsForClass(
      classId,
      user.role === "ADMIN"
    );
    const allowedSubjectSet = new Set(allowedSubjects.map((s) => s.id));
    const validSubjectIds = Array.from(new Set(subjectIds)).filter((id) =>
      allowedSubjectSet.has(id)
    );
    if (validSubjectIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one valid subject for this class" },
        { status: 400 }
      );
    }

    const validStudents = await prisma.student.findMany({
      where: { classId, status: "ACTIVE" },
      select: { id: true },
    });
    const validStudentIds = new Set(validStudents.map((s) => s.id));
    const filteredRecords = records.filter((r) =>
      validStudentIds.has(r.studentId)
    );
    if (filteredRecords.length === 0) {
      return NextResponse.json(
        { error: "No active students from this class in payload" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.examAttendance.findMany({
        where: {
          classId,
          date,
          examKey,
          subjectId: { in: validSubjectIds },
        },
        select: {
          id: true,
          studentId: true,
          subjectId: true,
          status: true,
          note: true,
        },
      });
      const existingMap = new Map(
        existing.map((row) => [`${row.studentId}:${row.subjectId}`, row])
      );

      const toCreate: {
        examId: string | null;
        examKey: string;
        classId: string;
        subjectId: string;
        studentId: string;
        date: string;
        status: "PRESENT" | "ABSENT";
        note: string | null;
        markedById: string;
      }[] = [];
      const toUpdate: {
        id: string;
        status: "PRESENT" | "ABSENT";
        note: string | null;
      }[] = [];

      for (const r of filteredRecords) {
        const note = r.note?.trim() || null;
        for (const subjectId of validSubjectIds) {
          const prev = existingMap.get(`${r.studentId}:${subjectId}`);
          if (!prev) {
            toCreate.push({
              examId: normalizedExamId,
              examKey,
              classId,
              subjectId,
              studentId: r.studentId,
              date,
              status: r.status,
              note,
              markedById: user.userId,
            });
          } else if (prev.status !== r.status || (prev.note ?? null) !== note) {
            toUpdate.push({
              id: prev.id,
              status: r.status,
              note,
            });
          }
        }
      }

      if (toCreate.length > 0) {
        await tx.examAttendance.createMany({ data: toCreate });
      }
      for (const item of toUpdate) {
        await tx.examAttendance.update({
          where: { id: item.id },
          data: {
            status: item.status,
            note: item.note,
            markedById: user.userId,
          },
        });
      }
    });

    await logAudit({
      userId: user.userId,
      action: "EXAM_ATTENDANCE_SAVED",
      entityType: "SchoolClass",
      entityId: classId,
      details: {
        date,
        examId: normalizedExamId,
        subjectIds: validSubjectIds,
        studentCount: filteredRecords.length,
      },
    });

    return NextResponse.json({
      savedStudents: filteredRecords.length,
      savedSubjects: validSubjectIds.length,
      totalRecords: filteredRecords.length * validSubjectIds.length,
    });
  } catch (err) {
    console.error("Save exam attendance error:", err);
    return NextResponse.json(
      { error: "Failed to save exam attendance" },
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
    const examKey = (searchParams.get("examId") ?? "").trim();
    const subjectIdsParam = searchParams.get("subjectIds") ?? "";
    const subjectIdList = subjectIdsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!classId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Valid classId and date (YYYY-MM-DD) are required" },
        { status: 400 }
      );
    }

    const accessErr = await verifyClassWriteAccess(user, classId);
    if (accessErr) return accessErr;

    const deleted = await prisma.examAttendance.deleteMany({
      where: {
        classId,
        date,
        examKey,
        ...(subjectIdList.length > 0
          ? { subjectId: { in: subjectIdList } }
          : {}),
      },
    });

    await logAudit({
      userId: user.userId,
      action: "EXAM_ATTENDANCE_CLEARED",
      entityType: "SchoolClass",
      entityId: classId,
      details: {
        date,
        examId: examKey || null,
        subjectIds: subjectIdList,
        deletedCount: deleted.count,
      },
    });

    return NextResponse.json({ deleted: deleted.count });
  } catch (err) {
    console.error("Delete exam attendance error:", err);
    return NextResponse.json(
      { error: "Failed to clear exam attendance" },
      { status: 500 }
    );
  }
}

