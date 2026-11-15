"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import {
  PayableInvoice,
  PayableInvoiceItem,
  PaymentCounterForm,
} from "@/components/PaymentCounterForm";
import {
  computeInvoiceItemBalances,
  dollarsToCents,
  formatCurrency,
  PAYMENT_METHOD_LABELS,
} from "@/lib/domain";
import { Pencil, Trash2, X } from "lucide-react";

type InvoiceItemRow = PayableInvoiceItem;
type OpenInvoice = PayableInvoice;

type PaymentAllocationRow = {
  id: string;
  invoiceItemId: string | null;
  feeStructureId: string | null;
  itemName: string;
  amountCents: number;
};

type PaymentRow = {
  id: string;
  receiptNo: string;
  invoiceId: string;
  amountCents: number;
  method: string;
  reference: string | null;
  note: string | null;
  paidAt: string;
  allocations: PaymentAllocationRow[];
  invoice: {
    id: string;
    invoiceNo: string;
    totalCents: number;
    paidCents: number;
    items: InvoiceItemRow[];
    student: { fullName: string; class: { name: string } };
  };
};

type EditPaymentState = {
  id: string;
  receiptNo: string;
  studentName: string;
  invoiceNo: string;
  invoiceTotalCents: number;
  otherPaidCents: number;
  invoiceItems: InvoiceItemRow[];
  mode: "ITEMS" | "GENERAL";
  selectedItems: Record<string, string>;
  amount: string;
  method: string;
  reference: string;
  note: string;
};

export default function AccountantPaymentsPage() {
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [lastReceiptId, setLastReceiptId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );
  const [editingPayment, setEditingPayment] = useState<EditPaymentState | null>(
    null
  );

  async function loadAll(preferredInvoiceId?: string) {
    const res = await fetch("/api/accountant/payments");
    if (!res.ok) return;
    const data = await res.json();
    const open: OpenInvoice[] = data.openInvoices ?? [];
    setOpenInvoices(open);
    setPayments(data.payments ?? []);
    if (open.length > 0) {
      const target =
        (preferredInvoiceId
          ? open.find((i) => i.id === preferredInvoiceId)
          : undefined) ?? open[0];
      setInvoiceId(target.id);
    } else {
      setInvoiceId("");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const currentInvoice = useMemo(
    () => openInvoices.find((i) => i.id === invoiceId) ?? null,
    [openInvoices, invoiceId]
  );

  function openEditModal(p: PaymentRow) {
    const otherPaidCents = Math.max(0, p.invoice.paidCents - p.amountCents);
    const itemsWithoutThisPayment: InvoiceItemRow[] = (p.invoice.items ?? []).map(
      (it) => ({
        ...it,
        allocations: (it.allocations ?? []).filter((a) => a.paymentId !== p.id),
      })
    );

    const selectedMap: Record<string, string> = {};
    for (const alloc of p.allocations ?? []) {
      const matched =
        (alloc.invoiceItemId
          ? itemsWithoutThisPayment.find((it) => it.id === alloc.invoiceItemId)
          : undefined) ??
        itemsWithoutThisPayment.find(
          (it) =>
            it.name.trim().toLowerCase() === alloc.itemName.trim().toLowerCase()
        );
      if (matched) {
        selectedMap[matched.id] = (alloc.amountCents / 100).toFixed(2);
      }
    }

    const hasMatchedItems =
      itemsWithoutThisPayment.length > 0 && Object.keys(selectedMap).length > 0;

    setEditingPayment({
      id: p.id,
      receiptNo: p.receiptNo,
      studentName: p.invoice.student.fullName,
      invoiceNo: p.invoice.invoiceNo,
      invoiceTotalCents: p.invoice.totalCents,
      otherPaidCents,
      invoiceItems: itemsWithoutThisPayment,
      mode: hasMatchedItems ? "ITEMS" : "GENERAL",
      selectedItems: selectedMap,
      amount: (p.amountCents / 100).toFixed(2),
      method: p.method,
      reference: p.reference ?? "",
      note: p.note ?? "",
    });
  }

  const editBalances = useMemo(() => {
    if (!editingPayment) return null;
    return computeInvoiceItemBalances({
      totalCents: editingPayment.invoiceTotalCents,
      paidCents: editingPayment.otherPaidCents,
      items: editingPayment.invoiceItems,
    });
  }, [editingPayment]);

  const editAmountCents = useMemo(() => {
    if (!editingPayment) return 0;
    if (editingPayment.mode === "ITEMS") {
      return Object.values(editingPayment.selectedItems).reduce(
        (sum, val) => sum + dollarsToCents(Number(val || 0)),
        0
      );
    }
    return dollarsToCents(Number(editingPayment.amount || 0));
  }, [editingPayment]);

  async function handleSaveEditPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPayment) return;
    setMsg(null);

    const allocations =
      editingPayment.mode === "ITEMS"
        ? Object.entries(editingPayment.selectedItems)
            .map(([itemId, val]) => {
              const item = editingPayment.invoiceItems.find(
                (it) => it.id === itemId
              );
              const cents = dollarsToCents(Number(val || 0));
              if (!item || cents <= 0) return null;
              return {
                invoiceItemId: item.id,
                feeStructureId: item.feeStructureId ?? null,
                itemName: item.name,
                amount: cents / 100,
              };
            })
            .filter((a): a is NonNullable<typeof a> => a !== null)
        : [];

    if (editingPayment.mode === "ITEMS" && allocations.length === 0) {
      setMsg({
        type: "err",
        text: "Select at least one fee structure or switch to General Payment.",
      });
      return;
    }

    const res = await fetch("/api/accountant/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingPayment.id,
        amount: editAmountCents / 100,
        method: editingPayment.method,
        reference: editingPayment.reference,
        note: editingPayment.note,
        allocations: editingPayment.mode === "ITEMS" ? allocations : [],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Failed to update payment" });
      return;
    }
    setEditingPayment(null);
    setMsg({
      type: "ok",
      text: `Updated receipt ${editingPayment.receiptNo}.`,
    });
    loadAll();
  }

  async function handleDeletePayment(p: PaymentRow) {
    if (
      !window.confirm(
        `Delete payment receipt ${p.receiptNo} (${formatCurrency(p.amountCents)}) for ${p.invoice.student.fullName}? This will restore the balance on their invoice.`
      )
    ) {
      return;
    }
    setMsg(null);
    const res = await fetch(`/api/accountant/payments?id=${p.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Failed to delete payment" });
      return;
    }
    setMsg({ type: "ok", text: `Deleted payment ${p.receiptNo}.` });
    loadAll();
  }

  return (
    <div>
      <PageHeader
        title="Record Fee Payment"
        subtitle="Select an invoice, choose which fee structure(s) are being paid, and issue a receipt"
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
            <div className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Select Unpaid / Partial Invoice
                </label>
                <select
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {openInvoices.map((inv) => {
                    const rem = inv.totalCents - inv.paidCents;
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.student.fullName} ({inv.student.class.name}) ·{" "}
                        {inv.invoiceNo} — Due {formatCurrency(rem)}
                      </option>
                    );
                  })}
                </select>
              </div>

              {currentInvoice && (
                <PaymentCounterForm
                  invoice={currentInvoice}
                  onSuccess={(payment, paidInvoiceId) => {
                    setLastReceiptId(payment.id);
                    setMsg({
                      type: "ok",
                      text: `Payment recorded. Receipt: ${payment.receiptNo}`,
                    });
                    loadAll(paidInvoiceId);
                  }}
                />
              )}
            </div>
          )}
        </Card>

        <Card title="Recent Receipts" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-3">Receipt</th>
                  <th className="py-2 pr-3">Student</th>
                  <th className="py-2 pr-3">Fee Paid</th>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3">Ref</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 text-right">Actions</th>
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
                        {p.invoice?.student?.fullName ?? "—"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {p.invoice?.student?.class?.name ?? "—"} ·{" "}
                        {p.invoice?.invoiceNo ?? ""}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3">
                      {p.allocations && p.allocations.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {p.allocations.map((a) => (
                            <span
                              key={a.id}
                              className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                            >
                              {a.itemName}: {formatCurrency(a.amountCents)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          General Payment
                        </span>
                      )}
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
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/print/receipt/${p.id}`}
                          className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-slate-50"
                        >
                          Receipt
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          title="Edit payment"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePayment(p)}
                          className="inline-flex items-center rounded border border-rose-200 bg-rose-50 p-1 text-rose-700 hover:bg-rose-100"
                          title="Delete payment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Edit Payment ({editingPayment.receiptNo})
                </h2>
                <p className="text-xs text-slate-500">
                  {editingPayment.studentName} · {editingPayment.invoiceNo}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditPayment} className="space-y-3">
              {editBalances && editBalances.items.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 uppercase">
                      Fee Structure(s) Paid
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingPayment({
                          ...editingPayment,
                          mode:
                            editingPayment.mode === "GENERAL"
                              ? "ITEMS"
                              : "GENERAL",
                        })
                      }
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-slate-100"
                    >
                      {editingPayment.mode === "GENERAL"
                        ? "Pick Fee Items"
                        : "Switch to General"}
                    </button>
                  </div>

                  {editingPayment.mode === "ITEMS" ? (
                    <div className="space-y-1.5">
                      {editBalances.items.map((item) => {
                        const checked =
                          item.id in editingPayment.selectedItems;
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                          >
                            <label className="flex flex-1 cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                disabled={item.isPaid && !checked}
                                checked={checked}
                                onChange={() => {
                                  const next = {
                                    ...editingPayment.selectedItems,
                                  };
                                  if (checked) {
                                    delete next[item.id];
                                  } else {
                                    next[item.id] = (
                                      item.maxPayableCents / 100
                                    ).toFixed(2);
                                  }
                                  setEditingPayment({
                                    ...editingPayment,
                                    selectedItems: next,
                                  });
                                }}
                                className="rounded border-slate-300 text-indigo-600"
                              />
                              <span>
                                <strong className="text-slate-900">
                                  {item.name}
                                </strong>
                                <span className="ml-1 text-[11px] text-slate-500">
                                  (Max {formatCurrency(item.maxPayableCents)})
                                </span>
                              </span>
                            </label>
                            {checked && (
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={(item.maxPayableCents / 100).toFixed(2)}
                                value={
                                  editingPayment.selectedItems[item.id] ?? ""
                                }
                                onChange={(e) =>
                                  setEditingPayment({
                                    ...editingPayment,
                                    selectedItems: {
                                      ...editingPayment.selectedItems,
                                      [item.id]: e.target.value,
                                    },
                                  })
                                }
                                className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-xs font-semibold tabular-nums"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600">
                      General (unallocated) payment amount
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Amount Paid
                </label>
                {editingPayment.mode === "ITEMS" ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 tabular-nums">
                    {formatCurrency(editAmountCents)}
                  </div>
                ) : (
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editingPayment.amount}
                    onChange={(e) =>
                      setEditingPayment({
                        ...editingPayment,
                        amount: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold tabular-nums"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Payment Method
                </label>
                <select
                  value={editingPayment.method}
                  onChange={(e) =>
                    setEditingPayment({
                      ...editingPayment,
                      method: e.target.value,
                    })
                  }
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
                  Reference / Transaction ID
                </label>
                <input
                  type="text"
                  value={editingPayment.reference}
                  onChange={(e) =>
                    setEditingPayment({
                      ...editingPayment,
                      reference: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Note
                </label>
                <input
                  type="text"
                  value={editingPayment.note}
                  onChange={(e) =>
                    setEditingPayment({
                      ...editingPayment,
                      note: e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    editAmountCents <= 0 ||
                    Boolean(
                      editBalances &&
                        editAmountCents > editBalances.invoiceRemainingCents
                    )
                  }
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
