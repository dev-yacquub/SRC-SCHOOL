"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import {
  PayableInvoice,
  PaymentCounterForm,
} from "@/components/PaymentCounterForm";
import { formatCurrency } from "@/lib/domain";
import { CreditCard, Download, X } from "lucide-react";

type InvoiceRow = PayableInvoice & {
  status: string;
};

export default function AccountantBalancesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [payingInvoice, setPayingInvoice] = useState<InvoiceRow | null>(null);
  const [lastReceiptId, setLastReceiptId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  async function loadBalances(status: string) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const res = await fetch(`/api/accountant/invoices?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setInvoices(data.invoices ?? []);
    }
  }

  useEffect(() => {
    loadBalances(statusFilter);
  }, [statusFilter]);

  return (
    <div>
      <PageHeader
        title="Student Fee Balances"
        subtitle="Filter by paid, partial, or unpaid status and export to Excel"
        action={
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="UNPAID">Unpaid Only</option>
              <option value="PARTIAL">Partial Only</option>
              <option value="PAID">Paid Only</option>
            </select>
            <a
              href={`/api/accountant/export${statusFilter ? `?status=${statusFilter}` : ""}`}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              <Download className="h-4 w-4" />
              Export Excel
            </a>
          </div>
        }
      />

      {msg && (
        <div
          className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm ${
            msg.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span>{msg.text}</span>
          {lastReceiptId && (
            <Link
              href={`/print/receipt/${lastReceiptId}`}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              Print Receipt PDF
            </Link>
          )}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
              <tr>
                <th className="py-2 pr-4">Invoice No</th>
                <th className="py-2 pr-4">Student</th>
                <th className="py-2 pr-4">Class</th>
                <th className="py-2 pr-4">Term</th>
                <th className="py-2 pr-4 text-right">Billed</th>
                <th className="py-2 pr-4 text-right">Paid</th>
                <th className="py-2 pr-4 text-right">Remaining</th>
                <th className="py-2 pr-4 text-right">Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-8 text-center text-sm text-slate-500"
                  >
                    No student invoices match this status filter.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const rem = Math.max(0, inv.totalCents - inv.paidCents);
                  const canPay =
                    inv.status !== "PAID" &&
                    inv.status !== "CANCELLED" &&
                    rem > 0;
                  return (
                    <tr key={inv.id}>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">
                        {inv.invoiceNo}
                      </td>
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-slate-900">
                          {inv.student.fullName}
                        </p>
                        <p className="font-mono text-xs text-slate-400">
                          {inv.student.admissionNo}
                        </p>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600">
                        {inv.student.class.name}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600">
                        {inv.term.name}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {formatCurrency(inv.totalCents)}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-emerald-700 tabular-nums">
                        {formatCurrency(inv.paidCents)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-bold text-rose-700 tabular-nums">
                        {formatCurrency(rem)}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <StatusBadge value={inv.status} />
                      </td>
                      <td className="py-2.5 text-right">
                        {canPay ? (
                          <button
                            type="button"
                            onClick={() => setPayingInvoice(inv)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Pay Invoice
                          </button>
                        ) : inv.status === "PAID" ? (
                          <span className="text-xs font-medium text-emerald-700">
                            Paid
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {payingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="my-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Pay Student Invoice
                </h2>
                <p className="text-xs text-slate-500">
                  {payingInvoice.student.fullName} (
                  {payingInvoice.student.class.name}) ·{" "}
                  {payingInvoice.student.admissionNo}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayingInvoice(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Close payment modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <PaymentCounterForm
              invoice={payingInvoice}
              onCancel={() => setPayingInvoice(null)}
              onSuccess={(payment) => {
                const studentName = payingInvoice.student.fullName;
                setPayingInvoice(null);
                setLastReceiptId(payment.id);
                setMsg({
                  type: "ok",
                  text: `Payment recorded for ${studentName}. Receipt: ${payment.receiptNo}`,
                });
                loadBalances(statusFilter);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

