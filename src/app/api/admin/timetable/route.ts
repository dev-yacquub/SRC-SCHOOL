import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { timetableSlotSchema } from "@/lib/validation";
import { detectTimetableConflict } from "@/lib/domain";

export async function GET(req: Request) {
  const { error } = await requireApiRole(["ADMIN", "TEACHER", "STUDENT"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId");
  const teacherId = searchParams.get("teacherId");

  const slots = await prisma.timetableSlot.findMany({
    where: {
      ...(classId ? { classSubject: { classId } } : {}),
      ...(teacherId ? { classSubject: { teacherId } } : {}),
    },
    include: {
      classSubject: {
        include: {
          class: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, code: true } },
          teacher: { select: { id: true, fullName: true } },
        },
      },
    },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });

  return NextResponse.json({ slots });
}

export async function POST(req: Request) {
  const { error } = await requireApiRole(["ADMIN"]);
  if (error) return error;

  try {
    const body = await req.json();
    const parsed = timetableSlotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid timetable slot" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const cs = await prisma.classSubject.findUnique({
      where: { id: d.classSubjectId },
    });
    if (!cs) {
      return NextResponse.json(
        { error: "Class subject assignment not found" },
        { status: 404 }
      );
    }

    const existing = await prisma.timetableSlot.findMany({
      where: {
        dayOfWeek: d.dayOfWeek,
        period: d.period,
      },
      include: {
        classSubject: {
          select: { classId: true, teacherId: true },
        },
      },
    });

    const conflict = detectTimetableConflict(
      existing.map((e) => ({
        id: e.id,
        classId: e.classSubject.classId,
        teacherId: e.classSubject.teacherId,
        dayOfWeek: e.dayOfWeek,
        period: e.period,
      })),
      {
        classId: cs.classId,
        teacherId: cs.teacherId,
        dayOfWeek: d.dayOfWeek,
        period: d.period,
      }
    );

    if (conflict) {
      return NextResponse.json({ error: conflict }, { status: 409 });
    }

    const created = await prisma.timetableSlot.create({
      data: d,
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    console.error("Timetable POST error:", err);
    return NextResponse.json(
      { error: "Failed to save timetable slot" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const { error } = await requireApiRole(["ADMIN"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  await prisma.timetableSlot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

