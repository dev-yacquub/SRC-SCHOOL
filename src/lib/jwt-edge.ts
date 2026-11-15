import { SignJWT, jwtVerify } from "jose";
import { AppRole } from "./role-routes";

export const SESSION_COOKIE_NAME = "sms_session";
export const MAX_SESSION_AGE_SECONDS = 60 * 60 * 12; // 12 hours
export const MAX_SESSION_AGE_MS = MAX_SESSION_AGE_SECONDS * 1000;

export type EdgeSession = {
  userId: string;
  username: string;
  fullName: string;
  role: AppRole;
  lastActivityAt: number;
  sessionStartedAt: number;
  mustChangePassword?: boolean;
};

const KNOWN_WEAK_SECRETS = new Set([
  "dev-school-management-secret-change-in-production-2026",
  "change-this-to-a-long-random-secret",
]);

let ephemeralDevSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) {
    if (KNOWN_WEAK_SECRETS.has(secret) || secret.length < 32) {
      throw new Error(
        "Insecure AUTH_SECRET configured. Set a random secret of at least 32 characters in .env."
      );
    }
    return new TextEncoder().encode(secret);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET environment variable is required in production.");
  }

  if (!ephemeralDevSecret) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    ephemeralDevSecret = bytes;
  }
  return ephemeralDevSecret;
}

export function getIdleTimeoutMs(): number {
  const mins = Number(process.env.SESSION_IDLE_MINUTES ?? "30");
  return (Number.isFinite(mins) && mins > 0 ? mins : 30) * 60 * 1000;
}

export function getSessionCookieOptions(maxAge = MAX_SESSION_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function signEdgeSession(
  payload: Omit<EdgeSession, "lastActivityAt" | "sessionStartedAt"> & {
    sessionStartedAt?: number;
  }
): Promise<string> {
  const now = Date.now();
  const sessionStartedAt = payload.sessionStartedAt ?? now;
  const remainingSeconds = Math.max(
    60,
    Math.floor((sessionStartedAt + MAX_SESSION_AGE_MS - now) / 1000)
  );

  return new SignJWT({
    userId: payload.userId,
    username: payload.username,
    fullName: payload.fullName,
    role: payload.role,
    mustChangePassword: Boolean(payload.mustChangePassword),
    sessionStartedAt,
    lastActivityAt: now,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${remainingSeconds}s`)
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
    const sessionStartedAt = Number(
      payload.sessionStartedAt ?? lastActivityAt ?? 0
    );
    const mustChangePassword = Boolean(payload.mustChangePassword);

    if (!userId || !username || !role) return null;
    const now = Date.now();
    if (now - lastActivityAt > getIdleTimeoutMs()) return null;
    if (now - sessionStartedAt > MAX_SESSION_AGE_MS) return null;

    return {
      userId,
      username,
      fullName: fullName ?? username,
      role,
      lastActivityAt,
      sessionStartedAt,
      mustChangePassword,
    };
  } catch {
    return null;
  }
}

