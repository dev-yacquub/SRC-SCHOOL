import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateTemporaryPassword,
  hashPassword,
  requireApiRole,
} from "@/lib/auth";
import { studentAccountActionSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireApiRole(["ADMISSION", "ADMIN"]);
  if (error || !user) return error;

  const { id } = await context.params;
  try {
    const body = await req.json();
    const parsed = studentAccountActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid account action" },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            isActive: true,
            username: true,
            lastLoginAt: true,
          },
        },
      },
    });
    if (!student || student.user.role !== "STUDENT") {
      return NextResponse.json({ error: "Student account not found" }, { status: 404 });
    }

    const d = parsed.data;
    if (d.action === "toggleActive") {
      const nextActive = d.isActive ?? !student.user.isActive;
      await prisma.user.update({
        where: { id: student.userId },
        data: {
          isActive: nextActive,
          ...(student.user.lastLoginAt && !nextActive
            ? { lastLoginAt: new Date(Date.now() + 2000) }
            : {}),
        },
      });
      await logAudit({
        userId: user.userId,
        action: nextActive ? "STUDENT_LOGIN_ENABLED" : "STUDENT_LOGIN_DISABLED",
        entityType: "Student",
        entityId: id,
        details: { username: student.user.username },
      });
      return NextResponse.json({ isActive: nextActive });
    }

    const tempPassword =
      d.newPassword && d.newPassword.trim().length >= 8
        ? d.newPassword.trim()
        : generateTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);
    await prisma.user.update({
      where: { id: student.userId },
      data: {
        passwordHash,
        mustChangePassword: true,
        ...(student.user.lastLoginAt
          ? { lastLoginAt: new Date(Date.now() + 2000) }
          : {}),
      },
    });

    await logAudit({
      userId: user.userId,
      action: "STUDENT_PASSWORD_RESET",
      entityType: "Student",
      entityId: id,
      details: { username: student.user.username },
    });

    return NextResponse.json({
      ok: true,
      username: student.user.username,
      temporaryPassword: tempPassword,
    });
  } catch (err) {
    console.error("Student account action error:", err);
    return NextResponse.json(
      { error: "Failed to update student login account" },
      { status: 500 }
    );
  }
}

