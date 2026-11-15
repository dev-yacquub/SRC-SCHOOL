import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { studentUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireApiRole(["ADMISSION", "ADMIN", "ACCOUNTANT"]);
  if (error) return error;

  const { id } = await context.params;
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      class: { include: { academicYear: { select: { name: true } } } },
      user: { select: { username: true, isActive: true, mustChangePassword: true, lastLoginAt: true } },
      enrollments: {
        include: {
          class: { select: { name: true } },
          academicYear: { select: { name: true } },
        },
        orderBy: { enrolledAt: "desc" },
      },
    },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  return NextResponse.json({ student });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireApiRole(["ADMISSION", "ADMIN"]);
  if (error || !user) return error;

  const { id } = await context.params;
  try {
    const body = await req.json();
    const parsed = studentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid student data" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const existing = await prisma.student.findUnique({
      where: { id },
      include: { class: { select: { academicYearId: true, name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    let targetClassYearId = existing.class.academicYearId;
    if (d.classId && d.classId !== existing.classId) {
      const targetClass = await prisma.schoolClass.findUnique({
        where: { id: d.classId },
      });
      if (!targetClass) {
        return NextResponse.json({ error: "Target class not found" }, { status: 404 });
      }
      targetClassYearId = targetClass.academicYearId;
    }

    const statusChanged = d.status !== undefined && d.status !== existing.status;
    const classChanged = d.classId !== undefined && d.classId !== existing.classId;
    const nextStatus = d.status ?? existing.status;
    const nextClassId = d.classId ?? existing.classId;

    const updated = await prisma.$transaction(async (tx) => {
      const stu = await tx.student.update({
        where: { id },
        data: {
          ...(d.fullName ? { fullName: d.fullName } : {}),
          ...(d.gender ? { gender: d.gender } : {}),
          ...(d.dob !== undefined ? { dob: d.dob ? new Date(d.dob) : null } : {}),
          ...(d.admissionDate !== undefined && d.admissionDate
            ? { admissionDate: new Date(d.admissionDate) }
            : {}),
          ...(d.photo !== undefined ? { photo: d.photo || null } : {}),
          ...(d.guardianName ? { guardianName: d.guardianName } : {}),
          ...(d.guardianPhone ? { guardianPhone: d.guardianPhone } : {}),
          ...(d.address !== undefined ? { address: d.address || null } : {}),
          ...(d.previousSchool !== undefined
            ? { previousSchool: d.previousSchool || null }
            : {}),
          ...(d.classId ? { classId: d.classId } : {}),
          ...(d.status ? { status: d.status } : {}),
          ...(d.statusReason !== undefined
            ? { statusReason: d.statusReason || null }
            : {}),
          ...(statusChanged ? { statusUpdatedAt: new Date() } : {}),
        },
      });

      if (d.fullName || statusChanged) {
        let activeUpdate: boolean | undefined;
        if (nextStatus === "TRANSFERRED" || nextStatus === "WITHDRAWN") {
          activeUpdate = false;
        } else if (statusChanged && nextStatus === "ACTIVE") {
          activeUpdate = true;
        }
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            ...(d.fullName ? { fullName: d.fullName } : {}),
            ...(activeUpdate !== undefined ? { isActive: activeUpdate } : {}),
          },
        });
      }

      if (classChanged || statusChanged) {
        await tx.enrollment.create({
          data: {
            studentId: id,
            classId: nextClassId,
            academicYearId: targetClassYearId,
            status: nextStatus,
            note: d.statusReason
              ? d.statusReason
              : classChanged
                ? "Class changed by Admission Office"
                : `Status changed to ${nextStatus}`,
          },
        });
      }

      return stu;
    });

    await logAudit({
      userId: user.userId,
      action: "STUDENT_UPDATED",
      entityType: "Student",
      entityId: id,
      details: {
        status: d.status,
        classId: d.classId,
        statusReason: d.statusReason,
      },
    });

    return NextResponse.json({ student: updated });
  } catch (err) {
    console.error("Update student error:", err);
    return NextResponse.json(
      { error: "Failed to update student" },
      { status: 500 }
    );
  }
}
