import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";
import {
  DUMMY_PASSWORD_HASH,
  SESSION_COOKIE_NAME,
  checkRateLimit,
  clearRateLimit,
  getClientIp,
  getSessionCookieOptions,
  recordFailedAttempt,
  signSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { AppRole, ROLE_HOME } from "@/lib/role-routes";
import { isFirestoreQuotaError } from "@/lib/firestore-backend";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const ipLimit = checkRateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          error: `Too many login attempts. Please try again in ${ipLimit.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
        }
      );
    }

    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid login request" },
        { status: 400 }
      );
    }

    const { identifier, password } = parsed.data;
    const normalized = identifier.toLowerCase();
    const userBucketKey = `login:user:${ip}:${normalized}`;

    const userLimit = checkRateLimit(userBucketKey, 5, 15 * 60 * 1000);
    if (!userLimit.allowed) {
      return NextResponse.json(
        {
          error: `Too many failed attempts for this account. Try again in ${userLimit.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(userLimit.retryAfterSeconds) },
        }
      );
    }

    const user = normalized.includes("@")
      ? (await prisma.user.findUnique({ where: { email: normalized } })) ??
        (await prisma.user.findUnique({ where: { username: normalized } }))
      : (await prisma.user.findUnique({ where: { username: normalized } })) ??
        (await prisma.user.findUnique({ where: { email: normalized } }));

    // Always run bcrypt comparison even when user is missing to prevent timing enumeration
    const valid = await verifyPassword(
      password,
      user ? user.passwordHash : DUMMY_PASSWORD_HASH
    );

    if (!user || !valid) {
      recordFailedAttempt(`login:ip:${ip}`, 20, 15 * 60 * 1000);
      recordFailedAttempt(userBucketKey, 5, 15 * 60 * 1000);
      return NextResponse.json(
        { error: "Invalid username/email or password" },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "Your account has been deactivated. Contact Admin." },
        { status: 403 }
      );
    }

    clearRateLimit(userBucketKey);

    const loginAt = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: loginAt },
    });

    const role = user.role as AppRole;
    const token = await signSessionToken({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role,
      mustChangePassword: user.mustChangePassword,
      sessionStartedAt: loginAt.getTime(),
    });

    const res = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role,
        mustChangePassword: user.mustChangePassword,
      },
      redirectTo: user.mustChangePassword ? "/change-password" : ROLE_HOME[role],
    });

    res.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

    return res;
  } catch (err) {
    console.error("Login error:", err);
    if (isFirestoreQuotaError(err)) {
      return NextResponse.json(
        {
          error:
            "Cloud Firestore daily quota exceeded (8 RESOURCE_EXHAUSTED). Please wait for the daily Spark quota reset or upgrade Firebase to the Blaze plan.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to authenticate" },
      { status: 500 }
    );
  }
}

