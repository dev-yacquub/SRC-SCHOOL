import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { settingsSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { invalidateSchoolContextCache } from "@/lib/shell-context";

export async function GET() {
  const { error } = await requireApiRole(["ADMIN"]);
  if (error) return error;

  const settings = await prisma.schoolSettings.findUnique({
    where: { id: "default" },
  });
  return NextResponse.json({ settings });
}

export async function PUT(req: Request) {
  const { user, error } = await requireApiRole(["ADMIN"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid settings" },
        { status: 400 }
      );
    }

    const updated = await prisma.schoolSettings.upsert({
      where: { id: "default" },
      update: parsed.data,
      create: { id: "default", ...parsed.data },
    });
    invalidateSchoolContextCache();

    await logAudit({
      userId: user.userId,
      action: "SETTINGS_UPDATED",
      entityType: "SchoolSettings",
      entityId: "default",
    });

    return NextResponse.json({ settings: updated });
  } catch (err) {
    console.error("Settings PUT error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}

