import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { getLateArrivalStats } from "@/lib/domain";

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const { user, error } = await requireApiRole(["ADMISSION", "ADMIN"]);
    if (error || !user) return error;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId")?.trim() ?? "";
    const rawDate = searchParams.get("date")?.trim() ?? "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : getTodayIso();
    const rawShift = searchParams.get("shift");
    const shift: "SHIFT_A" | "SHIFT_B" =
      rawShift === "SHIFT_B" ? "SHIFT_B" : "SHIFT_A";

    const [classes, students, lateRecords] = await Promise.all([
      prisma.schoolClass.findMany({
        orderBy: [{ level: "asc" }, { name: "asc" }],
        select: { id: true, name: true, level: true },
      }),
      prisma.student.findMany({
        where: {
          status: "ACTIVE",
          ...(classId ? { classId } : {}),
        },
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          admissionNo: true,
          fullName: true,
          classId: true,
          class: { select: { name: true } },
        },
      }),
      prisma.lateArrival.findMany({
        where: classId ? { classId } : undefined,
        include: {
          student: {
            select: {
              id: true,
              admissionNo: true,
              fullName: true,
              classId: true,
              class: { select: { name: true } },
            },
          },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const dateRecords = lateRecords
      .filter((r) => r.date === date && r.shift === shift)
      .map((r) => ({
        id: r.id,
        studentId: r.studentId,
        admissionNo: r.student.admissionNo,
        fullName: r.student.fullName,
        classId: r.student.classId,
        className: r.student.class.name,
        date: r.date,
        shift: r.shift as "SHIFT_A" | "SHIFT_B",
        note: r.note,
        punishedAt: r.punishedAt,
      }));

    const byStudent = new Map<string, typeof lateRecords>();
    for (const r of lateRecords) {
      const arr = byStudent.get(r.studentId) ?? [];
      arr.push(r);
      byStudent.set(r.studentId, arr);
    }

    const studentSummaries = Array.from(byStudent.entries())
      .map(([studentId, recs]) => {
        const first = recs[0];
        const stats = getLateArrivalStats(recs);
        return {
          studentId,
          admissionNo: first.student.admissionNo,
          fullName: first.student.fullName,
          classId: first.student.classId,
          className: first.student.class.name,
          ...stats,
          recentRecords: recs.slice(0, 6).map((r) => ({
            id: r.id,
            date: r.date,
            shift: r.shift as "SHIFT_A" | "SHIFT_B",
            note: r.note,
            punishedAt: r.punishedAt,
          })),
        };
      })
      .sort((a, b) => {
        if (a.needsPunishmentHighlight !== b.needsPunishmentHighlight) {
          return a.needsPunishmentHighlight ? -1 : 1;
        }
        if (a.unpunishedLateDays !== b.unpunishedLateDays) {
          return b.unpunishedLateDays - a.unpunishedLateDays;
        }
        return a.fullName.localeCompare(b.fullName);
      });

    return NextResponse.json({
      classes,
      students: students.map((s) => ({
        id: s.id,
        admissionNo: s.admissionNo,
        fullName: s.fullName,
        classId: s.classId,
        className: s.class.name,
      })),
      date,
      shift,
      dateRecords,
      studentSummaries,
    });
  } catch (err) {
    console.error("GET /api/admission/late error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to load late arrival records",
      },
      { status: 500 }
    );
  }
}

const recordLateSchema = z.object({
  action: z.literal("record").optional(),
  studentId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(["SHIFT_A", "SHIFT_B"]),
  note: z.string().max(250).optional(),
});

const punishLateSchema = z.object({
  action: z.literal("punish"),
  studentId: z.string().min(1),
});

const postSchema = z.union([punishLateSchema, recordLateSchema]);

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["ADMISSION", "ADMIN"]);
  if (error || !user) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid late arrival payload" },
      { status: 400 }
    );
  }

  if (parsed.data.action === "punish") {
    const { studentId } = parsed.data;
    const result = await prisma.lateArrival.updateMany({
      where: {
        studentId,
        punishedAt: null,
      },
      data: {
        punishedAt: new Date(),
        punishedById: user.userId,
      },
    });
    return NextResponse.json({
      ok: true,
      studentId,
      updatedCount: result.count,
    });
  }

  const { studentId, date, shift, note } = parsed.data;
  const student = await prisma.student.findFirst({
    where: { id: studentId, status: "ACTIVE" },
    select: { id: true, classId: true, fullName: true },
  });
  if (!student) {
    return NextResponse.json(
      { error: "Active student not found" },
      { status: 404 }
    );
  }

  const cleanNote = note?.trim() ? note.trim() : null;

  const record = await prisma.lateArrival.upsert({
    where: {
      studentId_date_shift: {
        studentId,
        date,
        shift,
      },
    },
    update: {
      classId: student.classId,
      note: cleanNote,
      markedById: user.userId,
    },
    create: {
      studentId,
      classId: student.classId,
      date,
      shift,
      note: cleanNote,
      markedById: user.userId,
    },
  });

  return NextResponse.json({ ok: true, record });
}

export async function DELETE(req: Request) {
  const { user, error } = await requireApiRole(["ADMISSION", "ADMIN"]);
  if (error || !user) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "Record id is required" }, { status: 400 });
  }

  await prisma.lateArrival.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

