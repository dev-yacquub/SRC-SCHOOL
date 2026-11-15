import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { AppRole, ROLE_HOME } from "./role-routes";
import {
  SESSION_COOKIE_NAME,
  EdgeSession,
  getSessionCookieOptions,
  signEdgeSession,
  verifyEdgeSession,
} from "./jwt-edge";

export { SESSION_COOKIE_NAME, getSessionCookieOptions };
export type SessionPayload = EdgeSession;

// Precomputed valid bcrypt cost-10 hash used to prevent username enumeration via timing
export const DUMMY_PASSWORD_HASH =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8D0R6V4eG8y6tQ0m1Z8q7W5x9vK2aG";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Generates a cryptographically random temporary password containing
 * uppercase, lowercase, digits, and special characters.
 */
export function generateTemporaryPassword(length = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%";
  const all = upper + lower + digits + symbols;

  const size = Math.max(10, length);
  const rand = new Uint32Array(size);
  crypto.getRandomValues(rand);

  const chars: string[] = [
    upper[rand[0] % upper.length],
    lower[rand[1] % lower.length],
    digits[rand[2] % digits.length],
    symbols[rand[3] % symbols.length],
  ];
  for (let i = 4; i < size; i++) {
    chars.push(all[rand[i] % all.length]);
  }
  // Fisher-Yates shuffle using additional random values
  const shuffleRand = new Uint32Array(chars.length);
  crypto.getRandomValues(shuffleRand);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffleRand[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

type RateBucket = {
  attempts: number;
  firstAttemptAt: number;
  lockedUntil: number;
};

const globalForRateLimit = globalThis as unknown as {
  __authRateBuckets?: Map<string, RateBucket>;
};

function getRateBuckets(): Map<string, RateBucket> {
  if (!globalForRateLimit.__authRateBuckets) {
    globalForRateLimit.__authRateBuckets = new Map();
  }
  return globalForRateLimit.__authRateBuckets;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim() || "unknown";
  }
  return req.headers.get("x-real-ip")?.trim() || "local";
}

export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000
): { allowed: boolean; retryAfterSeconds: number } {
  const buckets = getRateBuckets();
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry) return { allowed: true, retryAfterSeconds: 0 };

  if (entry.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000)),
    };
  }

  if (now - entry.firstAttemptAt > windowMs) {
    buckets.delete(key);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.attempts >= maxAttempts) {
    entry.lockedUntil = now + windowMs;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordFailedAttempt(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000
): void {
  const buckets = getRateBuckets();
  const now = Date.now();
  // Periodic pruning to prevent unbounded memory growth
  if (buckets.size > 5000) {
    for (const [k, v] of buckets.entries()) {
      if (now - v.firstAttemptAt > windowMs && v.lockedUntil <= now) {
        buckets.delete(k);
      }
    }
  }
  const existing = buckets.get(key);
  if (!existing || now - existing.firstAttemptAt > windowMs) {
    buckets.set(key, {
      attempts: 1,
      firstAttemptAt: now,
      lockedUntil: 0,
    });
    return;
  }
  existing.attempts += 1;
  if (existing.attempts >= maxAttempts) {
    existing.lockedUntil = now + windowMs;
  }
}

export function clearRateLimit(key: string): void {
  getRateBuckets().delete(key);
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
      lastLoginAt: true,
    },
  });

  if (!dbUser || !dbUser.isActive) return null;

  // Reject tokens issued prior to the latest login, password change, reset, or logout
  if (dbUser.lastLoginAt) {
    const latestValidMs = new Date(dbUser.lastLoginAt).getTime();
    if (
      Number.isFinite(latestValidMs) &&
      session.sessionStartedAt + 1000 < latestValidMs
    ) {
      return null;
    }
  }

  // If an admin reset the password while a session was active, invalidate old non-reset token
  if (!session.mustChangePassword && dbUser.mustChangePassword) {
    return null;
  }

  return {
    userId: dbUser.id,
    username: dbUser.username,
    fullName: dbUser.fullName,
    role: dbUser.role as AppRole,
    lastActivityAt: session.lastActivityAt,
    sessionStartedAt: session.sessionStartedAt,
    mustChangePassword: dbUser.mustChangePassword,
  };
}

export async function requireRole(
  allowedRoles?: AppRole[],
  options?: { allowPasswordChange?: boolean }
) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.mustChangePassword && !options?.allowPasswordChange) {
    redirect("/change-password");
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

export async function requireApiRole(
  allowedRoles?: AppRole[],
  options?: { allowPasswordChange?: boolean }
) {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.mustChangePassword && !options?.allowPasswordChange) {
    return {
      user: null,
      error: NextResponse.json(
        {
          error: "Password change required before accessing this resource",
          mustChangePassword: true,
        },
        { status: 403 }
      ),
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
