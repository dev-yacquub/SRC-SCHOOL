import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { recordPaymentSchema } from "@/lib/validation";
import {
  calculateInvoiceStatus,
  dollarsToCents,
  generateSequenceCode,
} from "@/lib/domain";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { error } = await requireApiRole(["ACCOUNTANT", "ADMIN"]);
  if (error) return error;

  const [payments, openInvoices] = await Promise.all([
    prisma.payment.findMany({
      include: {
        invoice: {
          include: {
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
        student: {
          select: {
            id: true,
            admissionNo: true,
            fullName: true,
            class: { select: { name: true } },
          },
        },
        term: { select: { name: true } },
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

    const payment = await prisma.$transaction(async (tx) => {
      let seq = (await tx.payment.count()) + 1;
      let receiptNo = generateSequenceCode(prefix, year, seq);
      while (await tx.payment.findUnique({ where: { receiptNo } })) {
        seq++;
        receiptNo = generateSequenceCode(prefix, year, seq);
      }

      const p = await tx.payment.create({
        data: {
          receiptNo,
          invoiceId: invoice.id,
          amountCents,
          method: d.method,
          reference: d.reference || null,
          note: d.note || null,
          paidAt: d.paidAt ? new Date(d.paidAt) : new Date(),
          receivedById: user.userId,
        },
      });

      const newPaid = invoice.paidCents + amountCents;
      const newStatus = calculateInvoiceStatus(invoice.totalCents, newPaid);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidCents: newPaid, status: newStatus },
      });

      return p;
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
      },
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    console.error("Record payment error:", err);
    return NextResponse.json(
      { error: "Failed to record payment" },
      { status: 500 }
    );
  }
}

