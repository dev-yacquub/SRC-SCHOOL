import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { AppRole, ROLE_HOME } from "./role-routes";
import {
  SESSION_COOKIE_NAME,
  EdgeSession,
  signEdgeSession,
  verifyEdgeSession,
} from "./jwt-edge";

export { SESSION_COOKIE_NAME };
export type SessionPayload = EdgeSession;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export const signSessionToken = signEdgeSession;
export const verifySessionToken = verifyEdgeSession;

export async function getSessionUser(): Promise<
  (SessionPayload & { mustChangePassword: boolean }) | null
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
    },
  });

  if (!dbUser || !dbUser.isActive) return null;

  return {
    userId: dbUser.id,
    username: dbUser.username,
    fullName: dbUser.fullName,
    role: dbUser.role as AppRole,
    lastActivityAt: session.lastActivityAt,
    mustChangePassword: dbUser.mustChangePassword,
  };
}

export async function requireRole(allowedRoles?: AppRole[]) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (
    allowedRoles &&
    user.role !== "ADMIN" &&
    !allowedRoles.includes(user.role)
  ) {
    redirect(ROLE_HOME[user.role]);
  }
  return user;
}

export async function requireApiRole(allowedRoles?: AppRole[]) {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (
    allowedRoles &&
    user.role !== "ADMIN" &&
    !allowedRoles.includes(user.role)
  ) {
    return {
      user: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user, error: null };
}
