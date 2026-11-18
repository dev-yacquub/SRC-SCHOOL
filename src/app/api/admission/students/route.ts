import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateTemporaryPassword,
  hashPassword,
  requireApiRole,
} from "@/lib/auth";
import { studentCreateSchema } from "@/lib/validation";
import {
  dollarsToCents,
  filterStudentDirectoryRecords,
  generateSequenceCode,
} from "@/lib/domain";
import { logAudit } from "@/lib/audit";

const VALID_STATUSES = new Set([
  "ACTIVE",
  "TRANSFERRED",
  "WITHDRAWN",
  "GRADUATED",
]);
const VALID_GENDERS = new Set(["MALE", "FEMALE"]);

export async function GET(req: Request) {
  const { error } = await requireApiRole(["ADMISSION", "ADMIN", "ACCOUNTANT"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const classId = searchParams.get("classId") ?? "";
  const statusRaw = searchParams.get("status") ?? "";
  const genderRaw = searchParams.get("gender") ?? "";
  const usesBusParam = searchParams.get("usesBus") ?? "";
  const status = VALID_STATUSES.has(statusRaw) ? statusRaw : "";
  const gender = VALID_GENDERS.has(genderRaw) ? genderRaw : "";
  const pageParam = searchParams.get("page");
  const limitParam = searchParams.get("limit");

  const baseWhere = {
    ...(classId ? { classId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(gender ? { gender: gender as never } : {}),
    ...(usesBusParam === "true"
      ? { usesBus: true }
      : usesBusParam === "false"
        ? { usesBus: false }
        : {}),
  };

  const limit = limitParam
    ? Math.min(200, Math.max(1, Number(limitParam) || 20))
    : 500;
  const page = pageParam ? Math.max(1, Number(pageParam) || 1) : 1;

  if (q) {
    const candidates = await prisma.student.findMany({
      where: baseWhere,
      include: {
        class: { select: { id: true, name: true, level: true } },
        user: { select: { username: true, isActive: true, mustChangePassword: true } },
      },
      orderBy: [{ admissionNo: "desc" }],
    });
    const matched = filterStudentDirectoryRecords(candidates, q);
    const total = matched.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const students = matched.slice((safePage - 1) * limit, safePage * limit);

    return NextResponse.json({
      students,
      total,
      page: safePage,
      limit,
      totalPages,
    });
  }

  const [total, students] = await Promise.all([
    prisma.student.count({ where: baseWhere }),
    prisma.student.findMany({
      where: baseWhere,
      include: {
        class: { select: { id: true, name: true, level: true } },
        user: { select: { username: true, isActive: true, mustChangePassword: true } },
      },
      orderBy: [{ admissionNo: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    students,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["ADMISSION", "ADMIN"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = studentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid student data" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const cls = await prisma.schoolClass.findUnique({ where: { id: d.classId } });
    if (!cls) {
      return NextResponse.json({ error: "Selected class not found" }, { status: 404 });
    }

    const settings = await prisma.schoolSettings.findUnique({
      where: { id: "default" },
    });
    const prefix = settings?.admissionPrefix ?? "ADM";
    const year = new Date().getFullYear();

    const defaultTempPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(defaultTempPassword);

    const created = await prisma.$transaction(async (tx) => {
      const count = await tx.student.count();
      let seq = count + 1;
      let admissionNo = generateSequenceCode(prefix, year, seq);
      while (await tx.student.findUnique({ where: { admissionNo } })) {
        seq++;
        admissionNo = generateSequenceCode(prefix, year, seq);
      }

      const username = admissionNo.toLowerCase();
      const studentUser = await tx.user.create({
        data: {
          username,
          fullName: d.fullName,
          passwordHash,
          role: "STUDENT",
          mustChangePassword: true,
        },
      });

      const admissionDate = d.admissionDate ? new Date(d.admissionDate) : new Date();
      const usesBus = Boolean(d.usesBus);
      const busFeeCents =
        usesBus && typeof d.busFee === "number" && d.busFee > 0
          ? dollarsToCents(d.busFee)
          : null;
      const student = await tx.student.create({
        data: {
          userId: studentUser.id,
          admissionNo,
          fullName: d.fullName,
          gender: d.gender,
          dob: d.dob ? new Date(d.dob) : null,
          photo: d.photo || null,
          guardianName: d.guardianName,
          guardianPhone: d.guardianPhone,
          address: d.address || null,
          previousSchool: d.previousSchool || null,
          usesBus,
          busFeeCents,
          classId: d.classId,
          admissionDate,
        },
      });

      await tx.enrollment.create({
        data: {
          studentId: student.id,
          classId: d.classId,
          academicYearId: cls.academicYearId,
          status: "ACTIVE",
          enrolledAt: admissionDate,
          note: "Initial registration",
        },
      });

      return { student, username };
    });

    await logAudit({
      userId: user.userId,
      action: "STUDENT_REGISTERED",
      entityType: "Student",
      entityId: created.student.id,
      details: {
        admissionNo: created.student.admissionNo,
        classId: d.classId,
      },
    });

    return NextResponse.json(
      {
        student: created.student,
        credentials: {
          username: created.username,
          temporaryPassword: defaultTempPassword,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Register student error:", err);
    return NextResponse.json(
      { error: "Failed to register student" },
      { status: 500 }
    );
  }
}
