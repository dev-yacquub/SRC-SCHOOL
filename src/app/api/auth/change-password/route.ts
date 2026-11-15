import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  requireApiRole,
  verifyPassword,
} from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const { user, error } = await requireApiRole();
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const valid = await verifyPassword(
      parsed.data.currentPassword,
      dbUser.passwordHash
    );
    if (!valid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { passwordHash, mustChangePassword: false },
    });

    await logAudit({
      userId: dbUser.id,
      action: "PASSWORD_CHANGED",
      entityType: "User",
      entityId: dbUser.id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Change password error:", err);
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    );
  }
}

