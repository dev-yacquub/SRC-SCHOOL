import React from "react";
import { requireRole } from "@/lib/auth";
import { getSchoolContext } from "@/lib/shell-context";
import { DashboardShell } from "@/components/DashboardShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(["ADMIN"]);
  const ctx = await getSchoolContext();

  return (
    <DashboardShell
      user={user}
      schoolName={ctx.schoolName}
      academicLabel={ctx.academicLabel}
    >
      {children}
    </DashboardShell>
  );
}

