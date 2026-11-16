import React from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isFirestoreQuotaError } from "@/lib/firestore-backend";
import { getSchoolContext } from "@/lib/shell-context";
import { ROLE_HOME } from "@/lib/role-routes";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let user: Awaited<ReturnType<typeof getSessionUser>> = null;
  let initialError: string | null = null;

  try {
    user = await getSessionUser();
  } catch (err) {
    console.error("LoginPage session lookup failed:", err);
    initialError = isFirestoreQuotaError(err)
      ? "Cloud Firestore daily quota exceeded (8 RESOURCE_EXHAUSTED). Please wait for the daily Spark quota reset (midnight Pacific Time) or upgrade Firebase to the Blaze plan."
      : "Database connection failed. Please try again in a moment.";
  }

  if (user) {
    redirect(ROLE_HOME[user.role]);
  }

  let needsSetup = false;
  let initialSchoolName = process.env.SCHOOL_NAME || "SRC Tech School";

  if (!initialError) {
    try {
      const [firstUser, ctx] = await Promise.all([
        prisma.user.findFirst({ select: { id: true } }),
        getSchoolContext(),
      ]);
      needsSetup = !firstUser;
      initialSchoolName = ctx.schoolName;
    } catch (err) {
      console.error("LoginPage bootstrap lookup failed:", err);
      initialError = isFirestoreQuotaError(err)
        ? "Cloud Firestore daily quota exceeded (8 RESOURCE_EXHAUSTED). Please wait for the daily Spark quota reset (midnight Pacific Time) or upgrade Firebase to the Blaze plan."
        : "Database connection failed. Please verify Cloud Firestore settings and try again.";
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
