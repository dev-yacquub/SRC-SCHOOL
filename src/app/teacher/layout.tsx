import React from "react";
import { requireRole } from "@/lib/auth";
import { getSchoolContext } from "@/lib/shell-context";
import { DashboardShell } from "@/components/DashboardShell";
import { TeacherMobileNav } from "@/components/TeacherMobileNav";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(["TEACHER", "ADMIN"]);
  const ctx = await getSchoolContext();

  return (
    <DashboardShell
      user={user}
      schoolName={ctx.schoolName}
      academicLabel={ctx.academicLabel}
    >
      <div className="pb-20 lg:pb-0">{children}</div>
      <TeacherMobileNav />
    </DashboardShell>
  );
}
