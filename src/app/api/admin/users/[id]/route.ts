import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireApiRole } from "@/lib/auth";
import { updateUserSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireApiRole(["ADMIN"]);
  if (error || !user) return error;

  const { id } = await context.params;

  try {
    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid data" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    if (id === user.userId && d.isActive === false) {
      return NextResponse.json(
        { error: "You cannot deactivate your own Admin account" },
        { status: 400 }
      );
    }
    if (id === user.userId && d.role && d.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You cannot demote your own Admin account" },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      include: { teacherProfile: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const nextUsername = d.username ? d.username.toLowerCase() : undefined;
    if (nextUsername && nextUsername !== target.username) {
      const existingUsername = await prisma.user.findUnique({
        where: { username: nextUsername },
      });
      if (existingUsername && existingUsername.id !== id) {
        return NextResponse.json(
          { error: "Username is already taken" },
          { status: 409 }
        );
      }
    }

    if (
      target.role === "ADMIN" &&
      target.isActive &&
      (d.isActive === false || (d.role && d.role !== "ADMIN"))
    ) {
      const activeAdmins = await prisma.user.count({
        where: { role: "ADMIN", isActive: true },
      });
      if (activeAdmins <= 1) {
        return NextResponse.json(
          { error: "Cannot deactivate or demote the last active Administrator" },
          { status: 400 }
        );
      }
    }

    const passwordHash = d.resetPassword
      ? await hashPassword(d.resetPassword)
      : undefined;

    const shouldRevokeSessions =
      Boolean(target.lastLoginAt) &&
      (Boolean(passwordHash) ||
        d.isActive === false ||
        (d.role !== undefined && d.role !== target.role));

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(nextUsername ? { username: nextUsername } : {}),
          ...(d.fullName ? { fullName: d.fullName } : {}),
          ...(d.email !== undefined
            ? { email: d.email ? d.email.toLowerCase() : null }
            : {}),
          ...(d.role ? { role: d.role } : {}),
          ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
          ...(passwordHash ? { passwordHash, mustChangePassword: true } : {}),
          ...(shouldRevokeSessions
            ? { lastLoginAt: new Date(Date.now() + 2000) }
            : {}),
        },
      });

      const finalRole = d.role ?? target.role;
      if (finalRole === "TEACHER") {
        if (target.teacherProfile) {
          await tx.teacher.update({
            where: { userId: id },
            data: {
              ...(d.fullName ? { fullName: d.fullName } : {}),
              ...(d.phone !== undefined ? { phone: d.phone || null } : {}),
              ...(d.qualification !== undefined
                ? { qualification: d.qualification || null }
                : {}),
            },
          });
        } else {
          await tx.teacher.create({
            data: {
              userId: id,
              fullName: d.fullName ?? target.fullName,
              phone: d.phone || null,
              qualification: d.qualification || null,
            },
          });
        }
      }
    });

    await logAudit({
      userId: user.userId,
      action: d.resetPassword ? "USER_PASSWORD_RESET" : "USER_UPDATED",
      entityType: "User",
      entityId: id,
      details: {
        isActive: d.isActive,
        role: d.role,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Update user error:", err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireApiRole(["ADMIN"]);
  if (error || !user) return error;

  const { id } = await context.params;
  if (id === user.userId) {
    return NextResponse.json(
      { error: "You cannot delete your own Admin account" },
      { status: 400 }
    );
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      include: { teacherProfile: true, studentProfile: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (target.role === "ADMIN" && target.isActive) {
      const activeAdmins = await prisma.user.count({
        where: { role: "ADMIN", isActive: true },
      });
      if (activeAdmins <= 1) {
        return NextResponse.json(
          { error: "Cannot delete the last active Administrator" },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      if (target.studentProfile) {
        const sid = target.studentProfile.id;
        await tx.payment.deleteMany({ where: { invoice: { studentId: sid } } });
        await tx.invoiceItem.deleteMany({ where: { invoice: { studentId: sid } } });
        await tx.invoice.deleteMany({ where: { studentId: sid } });
        await tx.mark.deleteMany({ where: { studentId: sid } });
        await tx.reportRemark.deleteMany({ where: { studentId: sid } });
        await tx.attendance.deleteMany({ where: { studentId: sid } });
        await tx.enrollment.deleteMany({ where: { studentId: sid } });
        await tx.student.delete({ where: { id: sid } });
      }
      if (target.teacherProfile) {
        const tid = target.teacherProfile.id;
        await tx.timetableSlot.deleteMany({
          where: { classSubject: { teacherId: tid } },
        });
        await tx.classSubject.deleteMany({ where: { teacherId: tid } });
        await tx.teacher.delete({ where: { id: tid } });
      }
      await tx.auditLog.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });

    await logAudit({
      userId: user.userId,
      action: "USER_DELETED",
      entityType: "User",
      entityId: id,
      details: { username: target.username, role: target.role },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete user error:", err);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}

