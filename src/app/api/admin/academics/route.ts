import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { invalidateSchoolContextCache } from "@/lib/shell-context";
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
    invalidateSchoolContextCache();

    if (action === "createYear") {
      const id = body?.id ? String(body.id) : undefined;
      const parsed = academicYearSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid year" },
          { status: 400 }
        );
      }
      const d = parsed.data;
      if (id) {
        const updated = await prisma.academicYear.update({
          where: { id },
          data: {
            name: d.name,
            startDate: new Date(d.startDate),
            endDate: new Date(d.endDate),
          },
        });
        return NextResponse.json({ id: updated.id });
      }
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
      const id = body?.id ? String(body.id) : undefined;
      const parsed = termSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid term" },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const yearExists = await prisma.academicYear.findUnique({
        where: { id: d.academicYearId },
      });
      if (!yearExists) {
        return NextResponse.json(
          { error: "Please create and select a valid Academic Year first" },
          { status: 400 }
        );
      }
      if (id) {
        const updated = await prisma.term.update({
          where: { id },
          data: {
            academicYearId: d.academicYearId,
            name: d.name,
            startDate: new Date(d.startDate),
            endDate: new Date(d.endDate),
          },
        });
        return NextResponse.json({ id: updated.id });
      }
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
      const id = body?.id ? String(body.id) : undefined;
      const parsed = classSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid class" },
          { status: 400 }
        );
      }
      const yearExists = await prisma.academicYear.findUnique({
        where: { id: parsed.data.academicYearId },
      });
      if (!yearExists) {
        return NextResponse.json(
          { error: "Please create and select a valid Academic Year first" },
          { status: 400 }
        );
      }
      if (id) {
        const updated = await prisma.schoolClass.update({
          where: { id },
          data: parsed.data,
        });
        return NextResponse.json({ id: updated.id });
      }
      const created = await prisma.schoolClass.create({ data: parsed.data });
      return NextResponse.json({ id: created.id }, { status: 201 });
    }

    if (action === "createSubject") {
      const id = body?.id ? String(body.id) : undefined;
      const parsed = subjectSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid subject" },
          { status: 400 }
        );
      }
      if (id) {
        const updated = await prisma.subject.update({
          where: { id },
          data: parsed.data,
        });
        return NextResponse.json({ id: updated.id });
      }
      const created = await prisma.subject.create({ data: parsed.data });
      return NextResponse.json({ id: created.id }, { status: 201 });
    }

    if (action === "assignClassSubject") {
      const id = body?.id ? String(body.id) : undefined;
      const parsed = classSubjectSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid assignment" },
          { status: 400 }
        );
      }
      const d = parsed.data;
      if (id) {
        const updated = await prisma.classSubject.update({
          where: { id },
          data: d,
        });
        return NextResponse.json({ id: updated.id });
      }
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
      await prisma.timetableSlot.deleteMany({ where: { classSubjectId: id } });
      await prisma.classSubject.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
    if (kind === "subject") {
      await prisma.timetableSlot.deleteMany({
        where: { classSubject: { subjectId: id } },
      });
      await prisma.classSubject.deleteMany({ where: { subjectId: id } });
      await prisma.mark.deleteMany({ where: { subjectId: id } });
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
      await prisma.timetableSlot.deleteMany({
        where: { classSubject: { classId: id } },
      });
      await prisma.classSubject.deleteMany({ where: { classId: id } });
      await prisma.feeStructure.deleteMany({ where: { classId: id } });
      await prisma.enrollment.deleteMany({ where: { classId: id } });
      await prisma.schoolClass.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
    if (kind === "term") {
      const invoiceCount = await prisma.invoice.count({ where: { termId: id } });
      if (invoiceCount > 0) {
        return NextResponse.json(
          { error: "Cannot delete a term that has fee invoices" },
          { status: 400 }
        );
      }
      await prisma.feeStructure.deleteMany({ where: { termId: id } });
      await prisma.exam.deleteMany({ where: { termId: id } });
      await prisma.term.delete({ where: { id } });
      invalidateSchoolContextCache();
      return NextResponse.json({ ok: true });
    }
    if (kind === "year") {
      const classCount = await prisma.schoolClass.count({
        where: { academicYearId: id },
      });
      if (classCount > 0) {
        return NextResponse.json(
          { error: "Cannot delete an academic year that still has classes" },
          { status: 400 }
        );
      }
      await prisma.term.deleteMany({ where: { academicYearId: id } });
      await prisma.academicYear.delete({ where: { id } });
      invalidateSchoolContextCache();
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unsupported kind" }, { status: 400 });
  } catch (err) {
    console.error("Academics DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}

