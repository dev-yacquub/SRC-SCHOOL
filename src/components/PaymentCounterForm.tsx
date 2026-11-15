"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  allocateInvoiceBalanceAcrossItems,
  computeInvoiceItemBalances,
  dollarsToCents,
  formatCurrency,
} from "@/lib/domain";

export type PayableInvoiceItem = {
  id: string;
  feeStructureId?: string | null;
  name: string;
  amountCents: number;
  allocations?: { id: string; paymentId: string; amountCents: number }[];
};

export type PayableInvoice = {
  id: string;
  invoiceNo: string;
  title?: string;
  totalCents: number;
  paidCents: number;
  discountCents?: number;
  discountReason?: string | null;
  status?: string;
  term: { id?: string; name: string };
  items: PayableInvoiceItem[];
  student: {
    id?: string;
    admissionNo: string;
    fullName: string;
    class: { id?: string; name: string };
  };
};

type PaymentCounterFormProps = {
  invoice: PayableInvoice;
  /** Called immediately after POST /api/accountant/payments succeeds. */
  onSuccess: (payment: { id: string; receiptNo: string }, invoiceId: string) => void;
  /** Optional cancel callback shown when rendered inside a modal. */
  onCancel?: () => void;
};

/**
 * Shared fee collection form with per-fee-structure allocation checkboxes,
 * partial/single-item ("Only") selection, and unallocated "General" mode.
 */
export function PaymentCounterForm({
  invoice,
  onSuccess,
  onCancel,
}: PaymentCounterFormProps) {
  const [paymentMode, setPaymentMode] = useState<"ITEMS" | "GENERAL">("ITEMS");
  const [selectedItemAmounts, setSelectedItemAmounts] = useState<
    Record<string, string>
  >({});
  const [generalAmount, setGeneralAmount] = useState("");
  const [method, setMethod] = useState("EVC_PLUS");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function applyInvoiceSelection(inv: PayableInvoice) {
    const balances = computeInvoiceItemBalances(inv);
    const unpaidItems = balances.items.filter((it) => !it.isPaid);
    if (unpaidItems.length === 0) {
      setPaymentMode("GENERAL");
      setSelectedItemAmounts({});
      setGeneralAmount((balances.invoiceRemainingCents / 100).toFixed(2));
      return;
    }

    const allocated = allocateInvoiceBalanceAcrossItems(
      unpaidItems.map((it) => ({
        id: it.id,
        itemRemainingCents: it.itemRemainingCents,
      })),
      balances.invoiceRemainingCents
    );
    const nextMap: Record<string, string> = {};
    for (const it of unpaidItems) {
      const cents = allocated[it.id] ?? 0;
      if (cents > 0) {
        nextMap[it.id] = (cents / 100).toFixed(2);
      }
    }
    setPaymentMode("ITEMS");
    setSelectedItemAmounts(nextMap);
    setGeneralAmount((balances.invoiceRemainingCents / 100).toFixed(2));
  }

  useEffect(() => {
    applyInvoiceSelection(invoice);
    setErrorMsg(null);
    setReference("");
    setNote("");
  }, [invoice]);

  const currentBalances = useMemo(
    () => computeInvoiceItemBalances(invoice),
    [invoice]
  );

  const itemSelectedTotalCents = useMemo(
    () =>
      Object.values(selectedItemAmounts).reduce(
        (sum, val) => sum + dollarsToCents(Number(val || 0)),
        0
      ),
    [selectedItemAmounts]
  );

  const effectiveAmountCents =
    paymentMode === "ITEMS"
      ? itemSelectedTotalCents
      : dollarsToCents(Number(generalAmount || 0));

  const exceedsInvoiceBalance =
    effectiveAmountCents > currentBalances.invoiceRemainingCents;

  const exceededItem = useMemo(() => {
    if (paymentMode !== "ITEMS") return null;
    for (const item of currentBalances.items) {
      if (!(item.id in selectedItemAmounts)) continue;
      const cents = dollarsToCents(Number(selectedItemAmounts[item.id] || 0));
      if (cents > item.maxPayableCents) {
        return item;
      }
    }
    return null;
  }, [paymentMode, currentBalances.items, selectedItemAmounts]);

  function toggleFeeItem(itemId: string, maxPayableCents: number) {
    setPaymentMode("ITEMS");
    setSelectedItemAmounts((prev) => {
      if (itemId in prev) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      const otherCents = Object.values(prev).reduce(
        (sum, val) => sum + dollarsToCents(Number(val || 0)),
        0
      );
      const budgetLeft = Math.max(
        0,
        currentBalances.invoiceRemainingCents - otherCents
      );
      const defaultCents =
        budgetLeft > 0 ? Math.min(maxPayableCents, budgetLeft) : maxPayableCents;
      return {
        ...prev,
        [itemId]: (defaultCents / 100).toFixed(2),
      };
    });
  }

  function selectOnlyFeeItem(itemId: string, maxPayableCents: number) {
    setPaymentMode("ITEMS");
    setSelectedItemAmounts({
      [itemId]: (maxPayableCents / 100).toFixed(2),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const allocations =
      paymentMode === "ITEMS"
        ? Object.entries(selectedItemAmounts)
            .map(([itemId, val]) => {
              const item = invoice.items.find((it) => it.id === itemId);
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

    if (paymentMode === "ITEMS" && allocations.length === 0) {
      setErrorMsg(
        "Select at least one fee structure to pay, or switch to General Payment."
      );
      return;
    }

    if (effectiveAmountCents <= 0) {
      setErrorMsg("Payment amount must be greater than 0.");
      return;
    }

    if (exceededItem) {
      setErrorMsg(
        `Payment for ${exceededItem.name} exceeds its remaining balance (${formatCurrency(exceededItem.maxPayableCents)}).`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/accountant/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: effectiveAmountCents / 100,
          method,
          reference,
          note,
          ...(paymentMode === "ITEMS" ? { allocations } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Failed to record payment");
        return;
      }

      setReference("");
      setNote("");
      onSuccess(data.payment, invoice.id);
    } catch {
      setErrorMsg("Network error while recording payment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {errorMsg && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
          {errorMsg}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
        <div className="flex items-center justify-between text-slate-600">
          <span>
            {invoice.invoiceNo} · {invoice.term.name}
          </span>
          <span className="font-semibold text-rose-700 tabular-nums">
            Balance Due: {formatCurrency(currentBalances.invoiceRemainingCents)}
          </span>
        </div>
        {(invoice.discountCents ?? 0) > 0 && (
          <p className="mt-1 text-[11px] text-amber-700">
            Includes discount of {formatCurrency(invoice.discountCents ?? 0)}
            {invoice.discountReason ? ` (${invoice.discountReason})` : ""}
          </p>
        )}
        {currentBalances.unallocatedPaidCents > 0 && (
          <p className="mt-1 text-[11px] text-slate-500">
            Prior unallocated payment:{" "}
            {formatCurrency(currentBalances.unallocatedPaidCents)}
          </p>
        )}
      </div>

      {currentBalances.items.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-xs font-semibold text-slate-800 uppercase">
              Fee Structure(s) Paid
            </span>
            <div className="flex flex-wrap gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => applyInvoiceSelection(invoice)}
                className="rounded border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-100"
              >
                All Unpaid
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMode("ITEMS");
                  setSelectedItemAmounts({});
                }}
                className="rounded border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-100"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() =>
                  setPaymentMode(
                    paymentMode === "GENERAL" ? "ITEMS" : "GENERAL"
                  )
                }
                className={`rounded border px-2 py-0.5 font-medium ${
                  paymentMode === "GENERAL"
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {paymentMode === "GENERAL" ? "Pick Fee Items" : "General"}
              </button>
            </div>
          </div>

          {paymentMode === "GENERAL" ? (
            <p className="text-xs text-slate-600">
              Recording a general (unallocated) payment against the invoice
              balance.
            </p>
          ) : (
            <div className="space-y-2">
              {currentBalances.items.map((item) => {
                const checked = item.id in selectedItemAmounts;
                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-2 text-xs transition ${
                      item.isPaid
                        ? "border-emerald-200 bg-emerald-50/60"
                        : checked
                          ? "border-indigo-300 bg-white shadow-2xs"
                          : "border-slate-200 bg-white/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          disabled={item.isPaid}
                          checked={checked}
                          onChange={() =>
                            toggleFeeItem(item.id, item.maxPayableCents)
                          }
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            Billed {formatCurrency(item.amountCents)}
                            {item.allocatedPaidCents > 0
                              ? ` · Paid ${formatCurrency(item.allocatedPaidCents)}`
                              : ""}
                            {!item.isPaid
                              ? ` · Due ${formatCurrency(item.maxPayableCents)}`
                              : ""}
                          </p>
                        </div>
                      </label>
                      {item.isPaid ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          PAID
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {checked && (
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={(item.maxPayableCents / 100).toFixed(2)}
                              value={selectedItemAmounts[item.id] ?? ""}
                              onChange={(e) =>
                                setSelectedItemAmounts((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-xs font-semibold tabular-nums"
                              aria-label={`Amount for ${item.name}`}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              selectOnlyFeeItem(item.id, item.maxPayableCents)
                            }
                            className="rounded bg-slate-100 px-1.5 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50"
                            title={`Pay only ${item.name}`}
                          >
                            Only
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">
          {paymentMode === "ITEMS"
            ? "Total Amount Paid (from selected fee structures)"
            : "Amount Paid"}
        </label>
        {paymentMode === "ITEMS" ? (
          <div
            className={`rounded-lg border px-3 py-2 text-sm font-bold tabular-nums ${
              exceedsInvoiceBalance || exceededItem
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "border-slate-200 bg-slate-50 text-slate-900"
            }`}
          >
            {formatCurrency(effectiveAmountCents)}
          </div>
        ) : (
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            value={generalAmount}
            onChange={(e) => setGeneralAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold tabular-nums"
          />
        )}
        {exceedsInvoiceBalance && (
          <p className="mt-1 text-xs text-rose-600">
            Exceeds remaining invoice balance of{" "}
            {formatCurrency(currentBalances.invoiceRemainingCents)}.
          </p>
        )}
        {!exceedsInvoiceBalance && exceededItem && (
          <p className="mt-1 text-xs text-rose-600">
            Payment for {exceededItem.name} exceeds its due balance of{" "}
            {formatCurrency(exceededItem.maxPayableCents)}.
          </p>
        )}
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

      <div className={onCancel ? "flex gap-2 pt-1" : ""}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={
            submitting ||
            exceedsInvoiceBalance ||
            exceededItem !== null ||
            effectiveAmountCents <= 0
          }
          className={`${onCancel ? "flex-1" : "w-full"} rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50`}
        >
          {submitting ? "Recording..." : "Confirm Payment & Issue Receipt"}
        </button>
      </div>
    </form>
  );
}

