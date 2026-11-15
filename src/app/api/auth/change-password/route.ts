import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  checkRateLimit,
  clearRateLimit,
  getSessionCookieOptions,
  hashPassword,
  recordFailedAttempt,
  requireApiRole,
  signSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { AppRole } from "@/lib/role-routes";
import { changePasswordSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(undefined, {
    allowPasswordChange: true,
  });
  if (error || !user) return error;

  try {
    const bucketKey = `pwchange:${user.userId}`;
    const rate = checkRateLimit(bucketKey, 5, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: `Too many password change attempts. Try again in ${rate.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }
      );
    }

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
      recordFailedAttempt(bucketKey, 5, 15 * 60 * 1000);
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }

    clearRateLimit(bucketKey);

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const changedAt = new Date();
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        lastLoginAt: changedAt,
      },
    });

    await logAudit({
      userId: dbUser.id,
      action: "PASSWORD_CHANGED",
      entityType: "User",
      entityId: dbUser.id,
    });

    // Issue a fresh session token and invalidate any older tokens via lastLoginAt
    const refreshedToken = await signSessionToken({
      userId: dbUser.id,
      username: dbUser.username,
      fullName: dbUser.fullName,
      role: dbUser.role as AppRole,
      mustChangePassword: false,
      sessionStartedAt: changedAt.getTime(),
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(
      SESSION_COOKIE_NAME,
      refreshedToken,
      getSessionCookieOptions()
    );
    return res;
  } catch (err) {
    console.error("Change password error:", err);
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    );
  }
}

