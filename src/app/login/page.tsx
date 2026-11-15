import React from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSchoolContext } from "@/lib/shell-context";
import { ROLE_HOME } from "@/lib/role-routes";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect(ROLE_HOME[user.role]);
  }

  const [userCount, ctx] = await Promise.all([
    prisma.user.count(),
    getSchoolContext(),
  ]);

  return (
    <LoginForm
      needsSetup={userCount === 0}
      initialSchoolName={ctx.settings?.schoolName ?? ""}
    />
  );
}
