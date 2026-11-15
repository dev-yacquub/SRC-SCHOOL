import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";

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
  const statusRaw = searchParams.get("status") ?? "";
  const status = VALID_INVOICE_STATUSES.has(statusRaw) ? statusRaw : "";

  const invoices = await prisma.invoice.findMany({
    where: status ? { status: status as never } : {},
    include: {
      student: {
        select: {
          admissionNo: true,
          fullName: true,
          guardianPhone: true,
          class: { select: { name: true } },
        },
      },
      term: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { student: { fullName: "asc" } }],
    take: 1000,
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Fee Balances");
  sheet.columns = [
    { header: "Invoice No", key: "invoiceNo", width: 18 },
    { header: "Admission No", key: "admissionNo", width: 16 },
    { header: "Student Name", key: "studentName", width: 26 },
    { header: "Class", key: "className", width: 14 },
    { header: "Guardian Phone", key: "phone", width: 18 },
    { header: "Term", key: "term", width: 12 },
    { header: "Total", key: "total", width: 12 },
    { header: "Paid", key: "paid", width: 12 },
    { header: "Balance", key: "balance", width: 12 },
    { header: "Status", key: "status", width: 12 },
  ];

  for (const inv of invoices) {
    sheet.addRow({
      invoiceNo: inv.invoiceNo,
      admissionNo: inv.student.admissionNo,
      studentName: inv.student.fullName,
      className: inv.student.class.name,
      phone: inv.student.guardianPhone,
      term: inv.term.name,
      total: inv.totalCents / 100,
      paid: inv.paidCents / 100,
      balance: (inv.totalCents - inv.paidCents) / 100,
      status: inv.status,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="student_fee_balances.xlsx"',
    },
  });
}

