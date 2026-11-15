import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireApiRole } from "@/lib/auth";
import { createUserSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const { error } = await requireApiRole(["ADMIN"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const includeStudents = searchParams.get("includeStudents") === "true";

  const users = await prisma.user.findMany({
    where: includeStudents ? undefined : { role: { not: "STUDENT" } },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      username: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      teacherProfile: {
        select: { id: true, phone: true, qualification: true },
      },
    },
  });

  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["ADMIN"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid user data" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const username = d.username.toLowerCase();
    const email = d.email ? d.email.toLowerCase() : null;

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          ...(email ? [{ email }] : []),
        ],
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Username or email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(d.password);

    const created = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username,
          email,
          fullName: d.fullName,
          role: d.role,
          passwordHash,
          mustChangePassword: true,
        },
      });

      if (d.role === "TEACHER") {
        await tx.teacher.create({
          data: {
            userId: newUser.id,
            fullName: d.fullName,
            phone: d.phone || null,
            qualification: d.qualification || null,
          },
        });
      }

      return newUser;
    });

    await logAudit({
      userId: user.userId,
      action: "USER_CREATED",
      entityType: "User",
      entityId: created.id,
      details: { username: created.username, role: created.role },
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    console.error("Create user error:", err);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}

