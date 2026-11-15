import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSchoolContext } from "@/lib/shell-context";
import { formatCurrency, PAYMENT_METHOD_LABELS } from "@/lib/domain";
import { PrintButton } from "@/components/ui";
import SrcLogo from "@/components/SrcLogo";

export default async function PrintReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(["ACCOUNTANT", "ADMIN", "STUDENT"]);
  const { id } = await params;
  const ctx = await getSchoolContext();

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      allocations: true,
      invoice: {
        include: {
          term: true,
          items: true,
          student: {
            include: { class: true },
          },
        },
      },
    },
  });

  if (!payment) {
    return <div className="p-8 text-sm text-slate-600">Receipt not found.</div>;
  }

  if (
    user.role === "STUDENT" &&
    payment.invoice.student.userId !== user.userId
  ) {
    redirect("/student");
  }

  const remaining = payment.invoice.totalCents - payment.invoice.paidCents;

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="no-print mx-auto mb-4 flex max-w-2xl items-center justify-between">
        <Link
          href={
            user.role === "STUDENT" ? "/student/fees" : "/accountant/payments"
          }
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back
        </Link>
        <PrintButton label="Print / Save Receipt PDF" />
      </div>

      <div className="print-only-sheet mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <SrcLogo size={52} className="shrink-0" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">{ctx.schoolName}</h1>
              <p className="text-xs text-slate-500">{ctx.settings?.schoolAddress}</p>
              <p className="text-xs text-slate-500">
                {ctx.settings?.schoolPhone} · {ctx.settings?.schoolEmail}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Official Fee Receipt
            </p>
            <p className="mt-1 font-mono text-lg font-bold text-indigo-700">
              {payment.receiptNo}
            </p>
            <p className="text-xs text-slate-500">
              Date: {new Date(payment.paidAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="my-6 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Student</p>
            <p className="font-semibold text-slate-900">
              {payment.invoice.student.fullName}
            </p>
            <p className="font-mono text-xs text-slate-500">
              {payment.invoice.student.admissionNo} ·{" "}
              {payment.invoice.student.class.name}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Invoice / Term</p>
            <p className="font-semibold text-slate-900">
              {payment.invoice.invoiceNo}
            </p>
            <p className="text-xs text-slate-500">{payment.invoice.term.name}</p>
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
            <tr>
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payment.allocations.length > 0 && (
              <tr>
                <td className="py-3 align-top text-slate-600">
                  Fee Structure(s) Paid
                </td>
                <td className="py-3 text-right">
                  <div className="space-y-1">
                    {payment.allocations.map((a) => (
                      <div
                        key={a.id}
                        className="font-medium text-slate-900 tabular-nums"
                      >
                        {a.itemName}:{" "}
                        {formatCurrency(a.amountCents, ctx.currencySymbol)}
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            )}
            <tr>
              <td className="py-3 text-slate-600">Payment Method</td>
              <td className="py-3 text-right font-medium text-slate-900">
                {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                {payment.reference ? ` (${payment.reference})` : ""}
              </td>
            </tr>
            <tr>
              <td className="py-3 text-slate-600">Invoice Total</td>
              <td className="py-3 text-right tabular-nums">
                {formatCurrency(payment.invoice.totalCents, ctx.currencySymbol)}
              </td>
            </tr>
            <tr>
              <td className="py-3 font-semibold text-slate-900">
                Amount Paid Now
              </td>
              <td className="py-3 text-right text-lg font-bold text-emerald-700 tabular-nums">
                {formatCurrency(payment.amountCents, ctx.currencySymbol)}
              </td>
            </tr>
            <tr>
              <td className="py-3 text-slate-600">Remaining Invoice Balance</td>
              <td className="py-3 text-right font-semibold text-slate-900 tabular-nums">
                {formatCurrency(remaining, ctx.currencySymbol)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-10 flex items-center justify-between border-t border-slate-200 pt-6 text-xs text-slate-500">
          <span>Thank you for your payment.</span>
          <span>Accountant Signature: ______________________</span>
        </div>
      </div>
    </div>
  );
}

