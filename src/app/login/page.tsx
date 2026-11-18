import React from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { databaseProvider, prisma } from "@/lib/prisma";
import { isFirestoreQuotaError } from "@/lib/firestore-backend";
import { getSchoolContext } from "@/lib/shell-context";
import { ROLE_HOME } from "@/lib/role-routes";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

function formatDatabaseConnectionError(err: unknown): string {
  if (isFirestoreQuotaError(err)) {
    return "Cloud Firestore daily quota exceeded (8 RESOURCE_EXHAUSTED). Please wait for the daily Spark quota reset (midnight Pacific Time) or upgrade Firebase to the Blaze plan.";
  }
  if (databaseProvider === "firebase") {
    return "Database connection failed. Please verify Cloud Firestore settings and try again.";
  }
  if (databaseProvider === "postgres") {
    return "Database connection failed. PostgreSQL may be waking up or unreachable—please refresh in a moment.";
  }
  return "Database connection failed. Please try again in a moment.";
}

async function withOneRetry<T>(fn: () => Promise<T>, delayMs = 600): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isFirestoreQuotaError(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return await fn();
  }
}

export default async function LoginPage() {
  let user: Awaited<ReturnType<typeof getSessionUser>> = null;
  let initialError: string | null = null;

  try {
    user = await withOneRetry(() => getSessionUser());
  } catch (err) {
    console.error("LoginPage session lookup failed:", err);
    initialError = formatDatabaseConnectionError(err);
  }

  if (user) {
    redirect(ROLE_HOME[user.role]);
  }

  let needsSetup = false;
  let initialSchoolName = process.env.SCHOOL_NAME || "SRC Tech School";

  if (!initialError) {
    try {
      const [firstUser, ctx] = await withOneRetry(() =>
        Promise.all([
          prisma.user.findFirst({ select: { id: true } }),
          getSchoolContext(),
        ])
      );
      needsSetup = !firstUser;
      initialSchoolName = ctx.schoolName;
    } catch (err) {
      console.error("LoginPage bootstrap lookup failed:", err);
      initialError = formatDatabaseConnectionError(err);
    }
  }

  return (
    <LoginForm
      needsSetup={needsSetup}
      initialSchoolName={initialSchoolName}
      initialError={initialError}
    />
  );
}
