import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { expenseSchema } from "@/lib/validation";
import { dollarsToCents } from "@/lib/domain";

export async function GET() {
  const { error } = await requireApiRole(["ACCOUNTANT", "ADMIN"]);
  if (error) return error;

  const expenses = await prisma.expense.findMany({
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ expenses });
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["ACCOUNTANT"]);
  if (error || !user) return error;

  try {
    const body = await req.json();
    const parsed = expenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid expense data" },
        { status: 400 }
      );
    }
    const d = parsed.data;
    const expense = await prisma.expense.create({
      data: {
        title: d.title,
        category: d.category,
        amountCents: dollarsToCents(d.amount),
        date: d.date ? new Date(d.date) : new Date(),
        note: d.note || null,
        recordedById: user.userId,
      },
    });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (err) {
    console.error("Expense POST error:", err);
    return NextResponse.json(
      { error: "Failed to save expense" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const { error } = await requireApiRole(["ACCOUNTANT"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  await prisma.expense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

