import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import { feeStructureSchema } from "@/lib/validation";
import { dollarsToCents } from "@/lib/domain";

export async function GET() {
  const { error } = await requireApiRole(["ACCOUNTANT", "ADMIN"]);
  if (error) return error;

  const [structures, classes, terms] = await Promise.all([
    prisma.feeStructure.findMany({
      include: {
        class: { select: { id: true, name: true, level: true } },
        term: { select: { id: true, name: true } },
      },
      orderBy: [{ term: { startDate: "asc" } }, { class: { level: "asc" } }],
    }),
    prisma.schoolClass.findMany({ orderBy: { level: "asc" } }),
    prisma.term.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  return NextResponse.json({ structures, classes, terms });
}

export async function POST(req: Request) {
  const { error } = await requireApiRole(["ACCOUNTANT"]);
  if (error) return error;

  try {
    const body = await req.json();
    const parsed = feeStructureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid fee structure" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const amountCents = dollarsToCents(d.amount);
    const saved = await prisma.feeStructure.upsert({
      where: {
        classId_termId_name: {
          classId: d.classId,
          termId: d.termId,
          name: d.name,
        },
      },
      update: { amountCents },
      create: {
        classId: d.classId,
        termId: d.termId,
        name: d.name,
        amountCents,
      },
    });

    return NextResponse.json({ structure: saved }, { status: 201 });
  } catch (err) {
    console.error("Fee structure POST error:", err);
    return NextResponse.json(
      { error: "Failed to save fee structure" },
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
  await prisma.feeStructure.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

