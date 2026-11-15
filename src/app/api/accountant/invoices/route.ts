import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { generateInvoicesSchema } from "@/lib/validation";
import {
  calculateInvoiceStatus,
  calculateInvoiceTotals,
  dollarsToCents,
  generateSequenceCode,
} from "@/lib/domain";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const { error } = await requireApiRole(["ACCOUNTANT", "ADMIN"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const termId = searchParams.get("termId") ?? "";
  const status = searchParams.get("status") ?? "";
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(termId ? { termId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [
              { invoiceNo: { contains: q } },
              { student: { fullName: { contains: q } } },
              { student: { admissionNo: { contains: q } } },
            ],
          }
        : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          admissionNo: true,
          fullName: true,
          class: { select: { id: true, name: true } },
        },
      },
      term: { select: { id: true, name: true } },
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invoices });
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["ACCOUNTANT"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = generateInvoicesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid invoice request" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const term = await prisma.term.findUnique({ where: { id: d.termId } });
    if (!term) {
      return NextResponse.json({ error: "Term not found" }, { status: 404 });
    }

    const students = await prisma.student.findMany({
      where: {
        status: "ACTIVE",
        ...(d.studentId ? { id: d.studentId } : {}),
        ...(d.classId ? { classId: d.classId } : {}),
      },
    });

    if (students.length === 0) {
      return NextResponse.json(
        { error: "No matching active students found" },
        { status: 400 }
      );
    }

    const feeStructures = await prisma.feeStructure.findMany({
      where: { termId: d.termId },
    });

    const settings = await prisma.schoolSettings.findUnique({
      where: { id: "default" },
    });
    const prefix = settings?.invoicePrefix ?? "INV";
    const year = new Date().getFullYear();
    const discountCents = dollarsToCents(d.discountAmount);

    const existingForTerm = await prisma.invoice.findMany({
      where: {
        termId: d.termId,
        status: { not: "CANCELLED" },
      },
      select: { studentId: true },
    });
    const alreadyBilled = new Set(existingForTerm.map((i) => i.studentId));

    let createdCount = 0;
    let skippedCount = 0;

    await prisma.$transaction(async (tx) => {
      let seq = (await tx.invoice.count()) + 1;

      for (const stu of students) {
        if (alreadyBilled.has(stu.id)) {
          skippedCount++;
          continue;
        }

        const classItems = feeStructures.filter((f) => f.classId === stu.classId);
        if (classItems.length === 0) {
          skippedCount++;
          continue;
        }

        const totals = calculateInvoiceTotals(classItems, discountCents);
        const status = calculateInvoiceStatus(totals.totalCents, 0);

        let invoiceNo = generateSequenceCode(prefix, year, seq);
        while (await tx.invoice.findUnique({ where: { invoiceNo } })) {
          seq++;
          invoiceNo = generateSequenceCode(prefix, year, seq);
        }
        seq++;

        await tx.invoice.create({
          data: {
            invoiceNo,
            studentId: stu.id,
            termId: d.termId,
            title: `${term.name} Fees - ${stu.fullName}`,
            subtotalCents: totals.subtotalCents,
            discountCents: totals.discountCents,
            discountReason: d.discountReason || null,
            totalCents: totals.totalCents,
            paidCents: 0,
            status,
            dueDate: d.dueDate ? new Date(d.dueDate) : null,
            createdById: user.userId,
            items: {
              create: classItems.map((ci) => ({
                name: ci.name,
                amountCents: ci.amountCents,
              })),
            },
          },
        });
        createdCount++;
      }
    });

    await logAudit({
      userId: user.userId,
      action: "INVOICES_GENERATED",
      entityType: "Invoice",
      entityId: d.termId,
      details: { createdCount, skippedCount, classId: d.classId || "ALL" },
    });

    return NextResponse.json(
      { createdCount, skippedCount },
      { status: 201 }
    );
  } catch (err) {
    console.error("Generate invoices error:", err);
    return NextResponse.json(
      { error: "Failed to generate invoices" },
      { status: 500 }
    );
  }
}

