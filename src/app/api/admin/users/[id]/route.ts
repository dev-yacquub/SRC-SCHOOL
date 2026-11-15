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

    const target = await prisma.user.findUnique({
      where: { id },
      include: { teacherProfile: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const passwordHash = d.resetPassword
      ? await hashPassword(d.resetPassword)
      : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(d.fullName ? { fullName: d.fullName } : {}),
          ...(d.email !== undefined
            ? { email: d.email ? d.email.toLowerCase() : null }
            : {}),
          ...(d.role ? { role: d.role } : {}),
          ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
          ...(passwordHash ? { passwordHash, mustChangePassword: true } : {}),
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

