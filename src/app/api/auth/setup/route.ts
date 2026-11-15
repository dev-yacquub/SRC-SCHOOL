import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  checkRateLimit,
  getClientIp,
  getSessionCookieOptions,
  hashPassword,
  recordFailedAttempt,
  signSessionToken,
} from "@/lib/auth";
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
    requiresSetupToken: Boolean(process.env.SETUP_TOKEN?.trim()),
    schoolName: settings?.schoolName ?? "",
  });
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rate = checkRateLimit(`setup:${ip}`, 5, 15 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: `Too many setup attempts. Try again in ${rate.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) },
        }
      );
    }

    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      return NextResponse.json(
        { error: "System setup has already been completed." },
        { status: 403 }
      );
    }

    const body = await req.json();

    const requiredSetupToken = process.env.SETUP_TOKEN?.trim();
    if (requiredSetupToken) {
      const providedToken =
        req.headers.get("x-setup-token")?.trim() ||
        (typeof body?.setupToken === "string" ? body.setupToken.trim() : "");
      if (providedToken !== requiredSetupToken) {
        recordFailedAttempt(`setup:${ip}`, 5, 15 * 60 * 1000);
        return NextResponse.json(
          { error: "Invalid or missing SETUP_TOKEN." },
          { status: 403 }
        );
      }
    }

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
    const initializedAt = new Date();

    const admin = await prisma.$transaction(async (tx) => {
      // Re-verify inside the serialized transaction to prevent concurrent double-setup
      const countInsideTx = await tx.user.count();
      if (countInsideTx > 0) {
        throw new Error("ALREADY_INITIALIZED");
      }

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
          lastLoginAt: initializedAt,
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
      mustChangePassword: false,
      sessionStartedAt: initializedAt.getTime(),
    });

    const res = NextResponse.json(
      {
        ok: true,
        redirectTo: "/admin",
      },
      { status: 201 }
    );

    res.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

    return res;
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_INITIALIZED") {
      return NextResponse.json(
        { error: "System setup has already been completed." },
        { status: 403 }
      );
    }
    console.error("Initial setup error:", err);
    return NextResponse.json(
      { error: "Failed to initialize school system" },
      { status: 500 }
    );
  }
}

