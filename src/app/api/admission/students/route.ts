import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireApiRole } from "@/lib/auth";
import { studentCreateSchema } from "@/lib/validation";
import { generateSequenceCode } from "@/lib/domain";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const { error } = await requireApiRole(["ADMISSION", "ADMIN", "ACCOUNTANT"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const classId = searchParams.get("classId") ?? "";
  const status = searchParams.get("status") ?? "";
  const gender = searchParams.get("gender") ?? "";
  const pageParam = searchParams.get("page");
  const limitParam = searchParams.get("limit");

  const where = {
    ...(classId ? { classId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(gender ? { gender: gender as never } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q } },
            { admissionNo: { contains: q } },
            { guardianName: { contains: q } },
            { guardianPhone: { contains: q } },
          ],
        }
      : {}),
  };

  const limit = limitParam ? Math.min(200, Math.max(1, Number(limitParam) || 20)) : 0;
  const page = pageParam ? Math.max(1, Number(pageParam) || 1) : 1;

  const [total, students] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      include: {
        class: { select: { id: true, name: true, level: true } },
        user: { select: { username: true, isActive: true, mustChangePassword: true } },
      },
      orderBy: [{ admissionNo: "desc" }],
      ...(limit > 0 ? { skip: (page - 1) * limit, take: limit } : {}),
    }),
  ]);

  return NextResponse.json({
    students,
    total,
    page,
    limit: limit || total,
    totalPages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1,
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

    const defaultTempPassword = "Student123!";
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
