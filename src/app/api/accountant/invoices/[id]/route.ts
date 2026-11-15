import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { calculateInvoiceStatus, dollarsToCents } from "@/lib/domain";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireApiRole(["ACCOUNTANT", "ADMIN"]);
  if (error || !user) return error;

  const { id } = await context.params;
  try {
    const body = await req.json();
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (body.action === "cancel") {
      if (invoice.paidCents > 0) {
        return NextResponse.json(
          { error: "Cannot cancel an invoice that already has payments" },
          { status: 400 }
        );
      }
      await prisma.invoice.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      await logAudit({
        userId: user.userId,
        action: "INVOICE_CANCELLED",
        entityType: "Invoice",
        entityId: id,
      });
      return NextResponse.json({ ok: true });
    }

    if (invoice.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Cannot edit a cancelled invoice" },
        { status: 400 }
      );
    }

    const discountAmount = Number(body.discountAmount ?? 0);
    if (!Number.isFinite(discountAmount) || discountAmount < 0) {
      return NextResponse.json({ error: "Invalid discount amount" }, { status: 400 });
    }
    const discountCents = Math.min(
      invoice.subtotalCents,
      dollarsToCents(discountAmount)
    );
    const totalCents = invoice.subtotalCents - discountCents;
    if (totalCents < invoice.paidCents) {
      return NextResponse.json(
        { error: "New total cannot be less than amount already paid" },
        { status: 400 }
      );
    }
    const status = calculateInvoiceStatus(totalCents, invoice.paidCents);

    await prisma.invoice.update({
      where: { id },
      data: {
        discountCents,
        discountReason: body.discountReason ? String(body.discountReason) : null,
        totalCents,
        status,
      },
    });

    await logAudit({
      userId: user.userId,
      action: "INVOICE_DISCOUNT_UPDATED",
      entityType: "Invoice",
      entityId: id,
      details: { discountCents, totalCents },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Update invoice error:", err);
    return NextResponse.json(
      { error: "Failed to update invoice" },
      { status: 500 }
    );
  }
}

