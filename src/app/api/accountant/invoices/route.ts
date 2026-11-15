import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { generateInvoicesSchema } from "@/lib/validation";
import {
  calculateInvoiceStatus,
  calculateInvoiceTotals,
  dollarsToCents,
  filterUnbilledStudentFeeItems,
  generateSequenceCode,
  isBusFeeItem,
  resolveStudentInvoiceItems,
} from "@/lib/domain";
import { logAudit } from "@/lib/audit";

const VALID_INVOICE_STATUSES = new Set([
  "UNPAID",
  "PARTIAL",
  "PAID",
  "CANCELLED",
]);

export async function GET(req: Request) {
  const { error } = await requireApiRole(["ACCOUNTANT", "ADMIN"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const termId = searchParams.get("termId") ?? "";
  const statusRaw = searchParams.get("status") ?? "";
  const status = VALID_INVOICE_STATUSES.has(statusRaw) ? statusRaw : "";
  const q = searchParams.get("q")?.trim().toLowerCase().slice(0, 100) ?? "";

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
          usesBus: true,
          busFeeCents: true,
          class: { select: { id: true, name: true } },
        },
      },
      term: { select: { id: true, name: true } },
      items: {
        include: {
          allocations: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
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

    const allTermFeeStructures = await prisma.feeStructure.findMany({
      where: { termId: d.termId },
    });

    if (d.feeStructureIds !== undefined && d.feeStructureIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one fee structure to invoice" },
        { status: 400 }
      );
    }

    const selectedFeeSet = d.feeStructureIds
      ? new Set(d.feeStructureIds)
      : null;
    const feeStructures = selectedFeeSet
      ? allTermFeeStructures.filter((f) => selectedFeeSet.has(f.id))
      : allTermFeeStructures;

    if (selectedFeeSet && feeStructures.length === 0) {
      return NextResponse.json(
        { error: "No matching fee structures found for the selected term" },
        { status: 400 }
      );
    }

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
      select: {
        studentId: true,
        items: {
          select: {
            feeStructureId: true,
            name: true,
          },
        },
      },
    });
    const billedItemsByStudent = new Map<
      string,
      { feeStructureId?: string | null; name: string }[]
    >();
    for (const inv of existingForTerm) {
      const list = billedItemsByStudent.get(inv.studentId) ?? [];
      list.push(...inv.items);
      billedItemsByStudent.set(inv.studentId, list);
    }

    let createdCount = 0;
    let skippedCount = 0;

    await prisma.$transaction(async (tx) => {
      let seq = (await tx.invoice.count()) + 1;

      for (const stu of students) {
        const classItems = feeStructures.filter((f) => f.classId === stu.classId);
        const resolvedItems = resolveStudentInvoiceItems(classItems, stu, {
          requireBusFeeStructure: Boolean(selectedFeeSet),
        });
        const existingStudentItems = billedItemsByStudent.get(stu.id) ?? [];
        const applicableItems = filterUnbilledStudentFeeItems(
          resolvedItems,
          existingStudentItems
        );
        if (applicableItems.length === 0) {
          skippedCount++;
          continue;
        }

        const allApplicableClassCount = allTermFeeStructures.filter(
          (f) => f.classId === stu.classId && (stu.usesBus || !isBusFeeItem(f))
        ).length;
        const isSubset =
          Boolean(selectedFeeSet) &&
          applicableItems.length < allApplicableClassCount;
        const invoiceTitle = isSubset
          ? `${term.name} (${applicableItems.map((i) => i.name).join(", ")}) - ${stu.fullName}`
          : `${term.name} Fees - ${stu.fullName}`;

        const totals = calculateInvoiceTotals(applicableItems, discountCents);
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
            title: invoiceTitle,
            subtotalCents: totals.subtotalCents,
            discountCents: totals.discountCents,
            discountReason: d.discountReason || null,
            totalCents: totals.totalCents,
            paidCents: 0,
            status,
            dueDate: d.dueDate ? new Date(d.dueDate) : null,
            createdById: user.userId,
            items: {
              create: applicableItems.map((ci) => ({
                feeStructureId: ci.feeStructureId ?? null,
                name: ci.name,
                amountCents: ci.amountCents,
              })),
            },
          },
        });
        existingStudentItems.push(...applicableItems);
        billedItemsByStudent.set(stu.id, existingStudentItems);
        createdCount++;
      }
    });

    await logAudit({
      userId: user.userId,
      action: "INVOICES_GENERATED",
      entityType: "Invoice",
      entityId: d.termId,
      details: {
        createdCount,
        skippedCount,
        classId: d.classId || "ALL",
        feeStructureIds: d.feeStructureIds ?? "ALL",
      },
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

