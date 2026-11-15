import { SignJWT, jwtVerify } from "jose";
import { AppRole } from "./role-routes";

export const SESSION_COOKIE_NAME = "sms_session";

export type EdgeSession = {
  userId: string;
  username: string;
  fullName: string;
  role: AppRole;
  lastActivityAt: number;
};

function getJwtSecret(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET || "dev-school-management-secret-change-in-production-2026";
  return new TextEncoder().encode(secret);
}

export function getIdleTimeoutMs(): number {
  const mins = Number(process.env.SESSION_IDLE_MINUTES ?? "30");
  return (Number.isFinite(mins) && mins > 0 ? mins : 30) * 60 * 1000;
}

export async function signEdgeSession(
  payload: Omit<EdgeSession, "lastActivityAt">
): Promise<string> {
  return new SignJWT({
    ...payload,
    lastActivityAt: Date.now(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getJwtSecret());
}

export async function verifyEdgeSession(
  token: string
): Promise<EdgeSession | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const userId = payload.userId as string | undefined;
    const username = payload.username as string | undefined;
    const fullName = payload.fullName as string | undefined;
    const role = payload.role as AppRole | undefined;
    const lastActivityAt = Number(payload.lastActivityAt ?? 0);

    if (!userId || !username || !role) return null;
    if (Date.now() - lastActivityAt > getIdleTimeoutMs()) return null;

    return {
      userId,
      username,
      fullName: fullName ?? username,
      role,
      lastActivityAt,
    };
  } catch {
    return null;
  }
}

