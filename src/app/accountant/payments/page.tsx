"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { formatCurrency, PAYMENT_METHOD_LABELS } from "@/lib/domain";

type OpenInvoice = {
  id: string;
  invoiceNo: string;
  totalCents: number;
  paidCents: number;
  term: { name: string };
  student: {
    admissionNo: string;
    fullName: string;
    class: { name: string };
  };
};

type PaymentRow = {
  id: string;
  receiptNo: string;
  amountCents: number;
  method: string;
  reference: string | null;
  paidAt: string;
  invoice: {
    invoiceNo: string;
    student: { fullName: string; class: { name: string } };
  };
};

export default function AccountantPaymentsPage() {
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("EVC_PLUS");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [lastReceiptId, setLastReceiptId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function loadAll() {
    const res = await fetch("/api/accountant/payments");
    if (!res.ok) return;
    const data = await res.json();
    const open = data.openInvoices ?? [];
    setOpenInvoices(open);
    setPayments(data.payments ?? []);
    if (open.length > 0) {
      setInvoiceId(open[0].id);
      setAmount(((open[0].totalCents - open[0].paidCents) / 100).toFixed(2));
    } else {
      setInvoiceId("");
      setAmount("");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function onSelectInvoice(id: string) {
    setInvoiceId(id);
    const inv = openInvoices.find((i) => i.id === id);
    if (inv) {
      setAmount(((inv.totalCents - inv.paidCents) / 100).toFixed(2));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLastReceiptId(null);

    const res = await fetch("/api/accountant/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId,
        amount: Number(amount),
        method,
        reference,
        note,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Failed to record payment" });
      return;
    }

    setLastReceiptId(data.payment.id);
    setReference("");
    setNote("");
    setMsg({
      type: "ok",
      text: `Payment recorded. Receipt: ${data.payment.receiptNo}`,
    });
    loadAll();
  }

  return (
    <div>
      <PageHeader
        title="Record Fee Payment"
        subtitle="Collect Cash, EVC Plus, Zaad, eDahab, or Bank payments and issue receipts"
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Fee Collection Counter" className="lg:col-span-1">
          {openInvoices.length === 0 ? (
            <p className="text-sm text-slate-500">
              All invoices are paid! Generate new invoices if needed.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Select Unpaid / Partial Invoice
                </label>
                <select
                  value={invoiceId}
                  onChange={(e) => onSelectInvoice(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {openInvoices.map((inv) => {
                    const rem = inv.totalCents - inv.paidCents;
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.student.fullName} ({inv.student.class.name}) — Due{" "}
                        {formatCurrency(rem)}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Amount Paid
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Payment Method
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="EVC_PLUS">EVC Plus</option>
                  <option value="ZAAD">Zaad</option>
                  <option value="EDAHAB">eDahab</option>
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Reference / Transaction ID (optional)
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. EVC-883412"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Confirm Payment & Issue Receipt
              </button>
            </form>
          )}
        </Card>

        <Card title="Recent Receipts" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-3">Receipt</th>
                  <th className="py-2 pr-3">Student</th>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3">Ref</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 text-right">Print</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-600">
                      {p.receiptNo}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-slate-900">
                        {p.invoice.student.fullName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {p.invoice.student.class.name}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700">
                      {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">
                      {p.reference ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-emerald-700 tabular-nums">
                      {formatCurrency(p.amountCents)}
                    </td>
                    <td className="py-2.5 text-right">
                      <Link
                        href={`/print/receipt/${p.id}`}
                        className="text-xs font-medium text-indigo-600 hover:underline"
                      >
                        Receipt
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

