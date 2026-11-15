import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import {
  academicYearSchema,
  classSchema,
  classSubjectSchema,
  subjectSchema,
  termSchema,
} from "@/lib/validation";

export async function GET() {
  const { error } = await requireApiRole(["ADMIN", "ADMISSION", "ACCOUNTANT"]);
  if (error) return error;

  const [years, terms, classes, subjects, teachers, classSubjects] =
    await Promise.all([
      prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
      prisma.term.findMany({
        orderBy: { startDate: "asc" },
        include: { academicYear: { select: { name: true } } },
      }),
      prisma.schoolClass.findMany({
        orderBy: [{ level: "asc" }, { name: "asc" }],
        include: {
          academicYear: { select: { name: true } },
          _count: { select: { students: { where: { status: "ACTIVE" } } } },
        },
      }),
      prisma.subject.findMany({ orderBy: { name: "asc" } }),
      prisma.teacher.findMany({
        where: { user: { isActive: true } },
        orderBy: { fullName: "asc" },
      }),
      prisma.classSubject.findMany({
        include: {
          class: { select: { id: true, name: true, level: true } },
          subject: { select: { id: true, name: true, code: true } },
          teacher: { select: { id: true, fullName: true } },
        },
        orderBy: [{ class: { level: "asc" } }, { subject: { name: "asc" } }],
      }),
    ]);

  return NextResponse.json({
    years,
    terms,
    classes,
    subjects,
    teachers,
    classSubjects,
  });
}

export async function POST(req: Request) {
  const { error } = await requireApiRole(["ADMIN"]);
  if (error) return error;

  try {
    const body = await req.json();
    const action = body?.action as string | undefined;

    if (action === "createYear") {
      const parsed = academicYearSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid year" },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const created = await prisma.$transaction(async (tx) => {
        if (d.isCurrent) {
          await tx.academicYear.updateMany({ data: { isCurrent: false } });
        }
        return tx.academicYear.create({
          data: {
            name: d.name,
            startDate: new Date(d.startDate),
            endDate: new Date(d.endDate),
            isCurrent: Boolean(d.isCurrent),
          },
        });
      });
      return NextResponse.json({ id: created.id }, { status: 201 });
    }

    if (action === "setCurrentYear") {
      const id = String(body.id ?? "");
      await prisma.$transaction([
        prisma.academicYear.updateMany({ data: { isCurrent: false } }),
        prisma.academicYear.update({ where: { id }, data: { isCurrent: true } }),
      ]);
      return NextResponse.json({ ok: true });
    }

    if (action === "createTerm") {
      const parsed = termSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid term" },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const created = await prisma.$transaction(async (tx) => {
        if (d.isCurrent) {
          await tx.term.updateMany({ data: { isCurrent: false } });
        }
        return tx.term.create({
          data: {
            academicYearId: d.academicYearId,
            name: d.name,
            startDate: new Date(d.startDate),
            endDate: new Date(d.endDate),
            isCurrent: Boolean(d.isCurrent),
          },
        });
      });
      return NextResponse.json({ id: created.id }, { status: 201 });
    }

    if (action === "setCurrentTerm") {
      const id = String(body.id ?? "");
      await prisma.$transaction([
        prisma.term.updateMany({ data: { isCurrent: false } }),
        prisma.term.update({ where: { id }, data: { isCurrent: true } }),
      ]);
      return NextResponse.json({ ok: true });
    }

    if (action === "createClass") {
      const parsed = classSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid class" },
          { status: 400 }
        );
      }
      const created = await prisma.schoolClass.create({ data: parsed.data });
      return NextResponse.json({ id: created.id }, { status: 201 });
    }

    if (action === "createSubject") {
      const parsed = subjectSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid subject" },
          { status: 400 }
        );
      }
      const created = await prisma.subject.create({ data: parsed.data });
      return NextResponse.json({ id: created.id }, { status: 201 });
    }

    if (action === "assignClassSubject") {
      const parsed = classSubjectSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid assignment" },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const saved = await prisma.classSubject.upsert({
        where: {
          classId_subjectId: {
            classId: d.classId,
            subjectId: d.subjectId,
          },
        },
        update: { teacherId: d.teacherId },
        create: d,
      });
      return NextResponse.json({ id: saved.id }, { status: 201 });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    console.error("Academics POST error:", err);
    return NextResponse.json(
      { error: "Operation failed (possible duplicate record)" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  const { error } = await requireApiRole(["ADMIN"]);
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind");
    const id = searchParams.get("id");
    if (!kind || !id) {
      return NextResponse.json({ error: "Missing kind or id" }, { status: 400 });
    }

    if (kind === "classSubject") {
      await prisma.classSubject.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
    if (kind === "subject") {
      await prisma.subject.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
    if (kind === "class") {
      const studentCount = await prisma.student.count({ where: { classId: id } });
      if (studentCount > 0) {
        return NextResponse.json(
          { error: "Cannot delete a class that has students" },
          { status: 400 }
        );
      }
      await prisma.schoolClass.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unsupported kind" }, { status: 400 });
  } catch (err) {
    console.error("Academics DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}

