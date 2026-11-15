import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { recordPaymentSchema, updatePaymentSchema } from "@/lib/validation";
import {
  calculateInvoiceStatus,
  dollarsToCents,
  generateSequenceCode,
  normalizeFeeItemName,
} from "@/lib/domain";
import { logAudit } from "@/lib/audit";

type AllocationInput = {
  invoiceItemId?: string;
  feeStructureId?: string | null;
  itemName?: string;
  amount: number;
};

type InvoiceItemWithAllocations = {
  id: string;
  feeStructureId: string | null;
  name: string;
  amountCents: number;
  allocations: {
    id: string;
    paymentId: string;
    amountCents: number;
  }[];
};

type ResolvedAllocation = {
  invoiceItemId: string;
  feeStructureId: string | null;
  itemName: string;
  amountCents: number;
};

function resolveAndValidateAllocations(
  requestedAllocations: AllocationInput[] | undefined,
  totalPaymentCents: number,
  items: InvoiceItemWithAllocations[],
  excludePaymentId?: string
): ResolvedAllocation[] {
  if (!requestedAllocations || requestedAllocations.length === 0) {
    return [];
  }

  const seenItemIds = new Set<string>();
  const resolved: ResolvedAllocation[] = [];
  let sumCents = 0;

  for (const reqAlloc of requestedAllocations) {
    let matched: InvoiceItemWithAllocations | undefined;
    if (reqAlloc.invoiceItemId) {
      matched = items.find((it) => it.id === reqAlloc.invoiceItemId);
    } else if (reqAlloc.feeStructureId) {
      matched = items.find((it) => it.feeStructureId === reqAlloc.feeStructureId);
    } else if (reqAlloc.itemName) {
      const targetName = normalizeFeeItemName(reqAlloc.itemName);
      matched = items.find((it) => normalizeFeeItemName(it.name) === targetName);
    }

    if (!matched) {
      throw new Error(
        "INVALID_ALLOCATION:Selected fee structure does not belong to this invoice"
      );
    }
    if (seenItemIds.has(matched.id)) {
      throw new Error(
        "INVALID_ALLOCATION:Duplicate fee structure selected in payment"
      );
    }
    seenItemIds.add(matched.id);

    const allocCents = dollarsToCents(reqAlloc.amount);
    if (allocCents <= 0) {
      throw new Error(
        "INVALID_ALLOCATION:Fee allocation amount must be greater than 0"
      );
    }

    const alreadyAllocatedCents = matched.allocations
      .filter((a) => !excludePaymentId || a.paymentId !== excludePaymentId)
      .reduce((sum, a) => sum + Math.max(0, a.amountCents), 0);
    const itemRemaining = Math.max(0, matched.amountCents - alreadyAllocatedCents);

    if (allocCents > itemRemaining) {
      throw new Error(
        `INVALID_ALLOCATION:Payment for ${matched.name} exceeds its remaining balance (${(itemRemaining / 100).toFixed(2)})`
      );
    }

    sumCents += allocCents;
    resolved.push({
      invoiceItemId: matched.id,
      feeStructureId: matched.feeStructureId ?? null,
      itemName: matched.name,
      amountCents: allocCents,
    });
  }

  if (sumCents !== totalPaymentCents) {
    throw new Error(
      `INVALID_ALLOCATION:Selected fee structure amounts (${(sumCents / 100).toFixed(2)}) must equal total payment amount (${(totalPaymentCents / 100).toFixed(2)})`
    );
  }

  return resolved;
}

export async function GET() {
  const { error } = await requireApiRole(["ACCOUNTANT", "ADMIN"]);
  if (error) return error;

  const [payments, openInvoices] = await Promise.all([
    prisma.payment.findMany({
      include: {
        allocations: true,
        invoice: {
          include: {
            items: {
              include: { allocations: true },
            },
            student: {
              select: {
                admissionNo: true,
                fullName: true,
                class: { select: { name: true } },
              },
            },
            term: { select: { name: true } },
          },
        },
      },
      orderBy: { paidAt: "desc" },
      take: 50,
    }),
    prisma.invoice.findMany({
      where: { status: { in: ["UNPAID", "PARTIAL"] } },
      include: {
        items: {
          include: { allocations: true },
        },
        student: {
          select: {
            id: true,
            admissionNo: true,
            fullName: true,
            class: { select: { id: true, name: true } },
          },
        },
        term: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({ payments, openInvoices });
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["ACCOUNTANT"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = recordPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payment details" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const amountCents = dollarsToCents(d.amount);
    if (amountCents <= 0) {
      return NextResponse.json(
        { error: "Payment amount must be greater than 0" },
        { status: 400 }
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: d.invoiceId },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cannot record payment on a cancelled invoice" },
        { status: 400 }
      );
    }

    const remaining = invoice.totalCents - invoice.paidCents;
    if (amountCents > remaining) {
      return NextResponse.json(
        {
          error: `Payment exceeds remaining balance (${(remaining / 100).toFixed(2)})`,
        },
        { status: 400 }
      );
    }

    const settings = await prisma.schoolSettings.findUnique({
      where: { id: "default" },
    });
    const prefix = settings?.receiptPrefix ?? "RCT";
    const year = new Date().getFullYear();

    const { payment, resolvedAllocations } = await prisma.$transaction(async (tx) => {
      // Re-fetch invoice inside the serialized transaction to prevent concurrent overpayment races
      const freshInvoice = await tx.invoice.findUnique({
        where: { id: d.invoiceId },
        include: {
          items: {
            include: { allocations: true },
          },
        },
      });
      if (!freshInvoice) {
        throw new Error("INVOICE_NOT_FOUND");
      }
      if (freshInvoice.status === "CANCELLED") {
        throw new Error("INVOICE_CANCELLED");
      }
      const freshRemaining = freshInvoice.totalCents - freshInvoice.paidCents;
      if (amountCents > freshRemaining) {
        throw new Error(
          `OVERPAYMENT:${(freshRemaining / 100).toFixed(2)}`
        );
      }

      const resolvedAllocs = resolveAndValidateAllocations(
        d.allocations,
        amountCents,
        freshInvoice.items
      );

      let seq = (await tx.payment.count()) + 1;
      let receiptNo = generateSequenceCode(prefix, year, seq);
      while (await tx.payment.findUnique({ where: { receiptNo } })) {
        seq++;
        receiptNo = generateSequenceCode(prefix, year, seq);
      }

      const p = await tx.payment.create({
        data: {
          receiptNo,
          invoiceId: freshInvoice.id,
          amountCents,
          method: d.method,
          reference: d.reference || null,
          note: d.note || null,
          paidAt: d.paidAt ? new Date(d.paidAt) : new Date(),
          receivedById: user.userId,
          ...(resolvedAllocs.length > 0
            ? {
                allocations: {
                  create: resolvedAllocs.map((a) => ({
                    invoiceItemId: a.invoiceItemId,
                    feeStructureId: a.feeStructureId,
                    itemName: a.itemName,
                    amountCents: a.amountCents,
                  })),
                },
              }
            : {}),
        },
        include: { allocations: true },
      });

      const newPaid = freshInvoice.paidCents + amountCents;
      const newStatus = calculateInvoiceStatus(freshInvoice.totalCents, newPaid);
      await tx.invoice.update({
        where: { id: freshInvoice.id },
        data: { paidCents: newPaid, status: newStatus },
      });

      return { payment: p, resolvedAllocations: resolvedAllocs };
    });

    await logAudit({
      userId: user.userId,
      action: "PAYMENT_RECORDED",
      entityType: "Payment",
      entityId: payment.id,
      details: {
        receiptNo: payment.receiptNo,
        invoiceNo: invoice.invoiceNo,
        amountCents,
        method: d.method,
        allocations: resolvedAllocations.map((a) => ({
          itemName: a.itemName,
          amountCents: a.amountCents,
        })),
      },
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "INVOICE_NOT_FOUND") {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }
      if (err.message === "INVOICE_CANCELLED") {
        return NextResponse.json(
          { error: "Cannot record payment on a cancelled invoice" },
          { status: 400 }
        );
      }
      if (err.message.startsWith("OVERPAYMENT:")) {
        const rem = err.message.slice("OVERPAYMENT:".length);
        return NextResponse.json(
          { error: `Payment exceeds remaining balance (${rem})` },
          { status: 400 }
        );
      }
      if (err.message.startsWith("INVALID_ALLOCATION:")) {
        return NextResponse.json(
          { error: err.message.slice("INVALID_ALLOCATION:".length) },
          { status: 400 }
        );
      }
    }
    console.error("Record payment error:", err);
    return NextResponse.json(
      { error: "Failed to record payment" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const { user, error } = await requireApiRole(["ACCOUNTANT", "ADMIN"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = updatePaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payment details" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const newAmountCents = dollarsToCents(d.amount);
    if (newAmountCents <= 0) {
      return NextResponse.json(
        { error: "Payment amount must be greater than 0" },
        { status: 400 }
      );
    }

    const existing = await prisma.payment.findUnique({
      where: { id: d.id },
      include: {
        allocations: true,
        invoice: {
          include: {
            items: {
              include: { allocations: true },
            },
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const otherPaidCents = Math.max(
      0,
      existing.invoice.paidCents - existing.amountCents
    );
    const maxAllowedCents = existing.invoice.totalCents - otherPaidCents;
    if (newAmountCents > maxAllowedCents) {
      return NextResponse.json(
        {
          error: `Updated payment exceeds invoice balance (${(maxAllowedCents / 100).toFixed(2)})`,
        },
        { status: 400 }
      );
    }

    let nextAllocations: ResolvedAllocation[] | null = null;
    if (d.allocations !== undefined) {
      nextAllocations = resolveAndValidateAllocations(
        d.allocations,
        newAmountCents,
        existing.invoice.items,
        existing.id
      );
    } else if (existing.allocations.length === 1 && existing.allocations[0].invoiceItemId) {
      nextAllocations = resolveAndValidateAllocations(
        [
          {
            invoiceItemId: existing.allocations[0].invoiceItemId,
            amount: newAmountCents / 100,
          },
        ],
        newAmountCents,
        existing.invoice.items,
        existing.id
      );
    } else if (existing.allocations.length > 1 && newAmountCents !== existing.amountCents) {
      return NextResponse.json(
        {
          error:
            "Specify the fee structure breakdown when changing the amount of a multi-item payment",
        },
        { status: 400 }
      );
    }

    const newPaidCents = otherPaidCents + newAmountCents;
    const newStatus = calculateInvoiceStatus(
      existing.invoice.totalCents,
      newPaidCents
    );

    const updated = await prisma.$transaction(async (tx) => {
      if (nextAllocations !== null) {
        await tx.paymentAllocation.deleteMany({ where: { paymentId: d.id } });
        for (const alloc of nextAllocations) {
          await tx.paymentAllocation.create({
            data: {
              paymentId: d.id,
              invoiceItemId: alloc.invoiceItemId,
              feeStructureId: alloc.feeStructureId,
              itemName: alloc.itemName,
              amountCents: alloc.amountCents,
            },
          });
        }
      }
      const p = await tx.payment.update({
        where: { id: d.id },
        data: {
          amountCents: newAmountCents,
          method: d.method,
          reference: d.reference || null,
          note: d.note || null,
        },
        include: { allocations: true },
      });
      await tx.invoice.update({
        where: { id: existing.invoiceId },
        data: { paidCents: newPaidCents, status: newStatus },
      });
      return p;
    });

    await logAudit({
      userId: user.userId,
      action: "PAYMENT_UPDATED",
      entityType: "Payment",
      entityId: updated.id,
      details: {
        receiptNo: updated.receiptNo,
        amountCents: newAmountCents,
        method: d.method,
      },
    });

    return NextResponse.json({ payment: updated });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("INVALID_ALLOCATION:")) {
      return NextResponse.json(
        { error: err.message.slice("INVALID_ALLOCATION:".length) },
        { status: 400 }
      );
    }
    console.error("Update payment error:", err);
    return NextResponse.json(
      { error: "Failed to update payment" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const { user, error } = await requireApiRole(["ACCOUNTANT", "ADMIN"]);
  if (error || !user) return error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
    }

    const existing = await prisma.payment.findUnique({
      where: { id },
      include: { invoice: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const newPaidCents = Math.max(
      0,
      existing.invoice.paidCents - existing.amountCents
    );
    const newStatus =
      existing.invoice.status === "CANCELLED"
        ? "CANCELLED"
        : calculateInvoiceStatus(existing.invoice.totalCents, newPaidCents);

    await prisma.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id } });
      await tx.invoice.update({
        where: { id: existing.invoiceId },
        data: { paidCents: newPaidCents, status: newStatus },
      });
    });

    await logAudit({
      userId: user.userId,
      action: "PAYMENT_DELETED",
      entityType: "Payment",
      entityId: id,
      details: {
        receiptNo: existing.receiptNo,
        amountCents: existing.amountCents,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete payment error:", err);
    return NextResponse.json(
      { error: "Failed to delete payment" },
      { status: 500 }
    );
  }
}

