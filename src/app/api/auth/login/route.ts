import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";
import {
  SESSION_COOKIE_NAME,
  signSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { AppRole, ROLE_HOME } from "@/lib/role-routes";

export async function POST(req: Request) {
  try {
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

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: normalized }, { email: normalized }],
      },
    });

    if (!user) {
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

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid username/email or password" },
        { status: 401 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const role = user.role as AppRole;
    const token = await signSessionToken({
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      role,
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

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Failed to authenticate" },
      { status: 500 }
    );
  }
}

