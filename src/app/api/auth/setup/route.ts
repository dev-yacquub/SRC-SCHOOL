import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth";
import { initialSetupSchema } from "@/lib/validation";

const STANDARD_GRADE_SCALE = [
  { minScore: 90, maxScore: 100, grade: "A", remark: "Excellent" },
  { minScore: 80, maxScore: 89.99, grade: "B", remark: "Very Good" },
  { minScore: 70, maxScore: 79.99, grade: "C", remark: "Good" },
  { minScore: 60, maxScore: 69.99, grade: "D", remark: "Satisfactory" },
  { minScore: 50, maxScore: 59.99, grade: "E", remark: "Pass" },
  { minScore: 0, maxScore: 49.99, grade: "F", remark: "Needs Improvement" },
];

export async function GET() {
  const [userCount, settings] = await Promise.all([
    prisma.user.count(),
    prisma.schoolSettings.findUnique({ where: { id: "default" } }),
  ]);

  return NextResponse.json({
    needsSetup: userCount === 0,
    schoolName: settings?.schoolName ?? "",
  });
}

export async function POST(req: Request) {
  try {
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      return NextResponse.json(
        { error: "System setup has already been completed." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = initialSetupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid setup details" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const passwordHash = await hashPassword(d.password);
    const username = d.username.toLowerCase();
    const email = d.email ? d.email.toLowerCase() : null;

    const admin = await prisma.$transaction(async (tx) => {
      await tx.schoolSettings.upsert({
        where: { id: "default" },
        update: {
          schoolName: d.schoolName,
          schoolAddress: d.schoolAddress ?? "",
          schoolPhone: d.schoolPhone ?? "",
          schoolEmail: d.schoolEmail ?? "",
          currency: d.currency,
          currencySymbol: d.currencySymbol,
        },
        create: {
          id: "default",
          schoolName: d.schoolName,
          schoolAddress: d.schoolAddress ?? "",
          schoolPhone: d.schoolPhone ?? "",
          schoolEmail: d.schoolEmail ?? "",
          currency: d.currency,
          currencySymbol: d.currencySymbol,
          admissionPrefix: "ADM",
          invoicePrefix: "INV",
          receiptPrefix: "RCT",
        },
      });

      if (d.includeDefaultGradeScale) {
        const scaleCount = await tx.gradeScale.count();
        if (scaleCount === 0) {
          await tx.gradeScale.createMany({ data: STANDARD_GRADE_SCALE });
        }
      }

      const createdAdmin = await tx.user.create({
        data: {
          username,
          email,
          fullName: d.fullName,
          passwordHash,
          role: "ADMIN",
          mustChangePassword: false,
          lastLoginAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: createdAdmin.id,
          action: "SYSTEM_INITIALIZED",
          entityType: "System",
          entityId: "default",
          details: JSON.stringify({ schoolName: d.schoolName, username }),
        },
      });

      return createdAdmin;
    });

    const token = await signSessionToken({
      userId: admin.id,
      username: admin.username,
      fullName: admin.fullName,
      role: "ADMIN",
    });

    const res = NextResponse.json(
      {
        ok: true,
        redirectTo: "/admin",
      },
      { status: 201 }
    );

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return res;
  } catch (err) {
    console.error("Initial setup error:", err);
    return NextResponse.json(
      { error: "Failed to initialize school system" },
      { status: 500 }
    );
  }
}

