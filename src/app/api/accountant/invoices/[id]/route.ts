import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { calculateInvoiceStatus, dollarsToCents } from "@/lib/domain";
import { updateInvoiceSchema } from "@/lib/validation";
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
    const parsed = updateInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid invoice update" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        items: {
          include: { allocations: true },
        },
      },
    });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (d.action === "cancel") {
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

    if (invoice.status === "CANCELLED" && d.action !== "updateInvoice") {
      return NextResponse.json(
        { error: "Cannot edit a cancelled invoice" },
        { status: 400 }
      );
    }

    const nextItems = d.items
      ? d.items.map((it) => ({
          id: it.id,
          feeStructureId: it.feeStructureId ?? undefined,
          name: it.name.trim(),
          amountCents: dollarsToCents(it.amount),
        }))
      : null;

    const existingItemMap = new Map(invoice.items.map((item) => [item.id, item]));
    if (nextItems) {
      for (const it of nextItems) {
        if (it.id) {
          const existingItem = existingItemMap.get(it.id);
          if (existingItem) {
            const itemPaidCents = existingItem.allocations.reduce(
              (s, a) => s + a.amountCents,
              0
            );
            if (it.amountCents < itemPaidCents) {
              return NextResponse.json(
                {
                  error: `Cannot reduce ${existingItem.name} below amount already paid for it (${(itemPaidCents / 100).toFixed(2)})`,
                },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    const subtotalCents = nextItems
      ? nextItems.reduce((s, it) => s + it.amountCents, 0)
      : invoice.subtotalCents;

    const discountAmount =
      d.discountAmount !== undefined
        ? Number(d.discountAmount)
        : invoice.discountCents / 100;
    if (!Number.isFinite(discountAmount) || discountAmount < 0) {
      return NextResponse.json({ error: "Invalid discount amount" }, { status: 400 });
    }
    const discountCents = Math.min(
      subtotalCents,
      dollarsToCents(discountAmount)
    );
    const totalCents = subtotalCents - discountCents;
    if (totalCents < invoice.paidCents) {
      return NextResponse.json(
        { error: "New total cannot be less than amount already paid" },
        { status: 400 }
      );
    }
    const status = calculateInvoiceStatus(totalCents, invoice.paidCents);

    await prisma.$transaction(async (tx) => {
      if (nextItems) {
        const retainedIds = new Set(
          nextItems
            .map((it) => it.id)
            .filter((itemId): itemId is string => Boolean(itemId && existingItemMap.has(itemId)))
        );

        for (const oldItem of invoice.items) {
          if (!retainedIds.has(oldItem.id)) {
            if (oldItem.allocations.length > 0) {
              await tx.paymentAllocation.updateMany({
                where: { invoiceItemId: oldItem.id },
                data: { invoiceItemId: null },
              });
            }
            await tx.invoiceItem.delete({ where: { id: oldItem.id } });
          }
        }

        for (const it of nextItems) {
          if (it.id && existingItemMap.has(it.id)) {
            await tx.invoiceItem.update({
              where: { id: it.id },
              data: {
                name: it.name,
                amountCents: it.amountCents,
                ...(it.feeStructureId !== undefined
                  ? { feeStructureId: it.feeStructureId }
                  : {}),
              },
            });
          } else {
            await tx.invoiceItem.create({
              data: {
                invoiceId: id,
                feeStructureId: it.feeStructureId ?? null,
                name: it.name,
                amountCents: it.amountCents,
              },
            });
          }
        }
      }
      await tx.invoice.update({
        where: { id },
        data: {
          subtotalCents,
          discountCents,
          discountReason:
            d.discountReason !== undefined
              ? d.discountReason || null
              : invoice.discountReason,
          totalCents,
          status,
        },
      });
    });

    await logAudit({
      userId: user.userId,
      action: nextItems ? "INVOICE_UPDATED" : "INVOICE_DISCOUNT_UPDATED",
      entityType: "Invoice",
      entityId: id,
      details: { subtotalCents, discountCents, totalCents },
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

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireApiRole(["ACCOUNTANT", "ADMIN"]);
  if (error || !user) return error;

  const { id } = await context.params;
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.delete({ where: { id } });
    });

    await logAudit({
      userId: user.userId,
      action: "INVOICE_DELETED",
      entityType: "Invoice",
      entityId: id,
      details: { invoiceNo: invoice.invoiceNo },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete invoice error:", err);
    return NextResponse.json(
      { error: "Failed to delete invoice" },
      { status: 500 }
    );
  }
}

