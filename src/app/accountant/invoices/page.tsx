"use client";

import React, { useEffect, useState } from "react";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { formatCurrency } from "@/lib/domain";

type InvoiceRow = {
  id: string;
  invoiceNo: string;
  subtotalCents: number;
  totalCents: number;
  paidCents: number;
  discountCents: number;
  discountReason: string | null;
  status: string;
  term: { name: string };
  student: {
    admissionNo: string;
    fullName: string;
    class: { name: string };
  };
};

type StudentOption = {
  id: string;
  admissionNo: string;
  fullName: string;
  class: { name: string };
};

export default function AccountantInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  async function loadInvoices() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const res = await fetch(`/api/accountant/invoices?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setInvoices(data.invoices ?? []);
    }
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/accountant/fee-structures").then((r) => r.json()),
      fetch("/api/admission/students?status=ACTIVE").then((r) => r.json()),
    ]).then(([fsData, stuData]) => {
      setTerms(fsData.terms ?? []);
      setClasses(fsData.classes ?? []);
      setStudents(stuData.students ?? []);
      if (fsData.terms?.length) setTermId(fsData.terms[0].id);
    });
    loadInvoices();
  }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setGenerating(true);
    const res = await fetch("/api/accountant/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termId,
        classId: studentId ? "" : classId,
        studentId,
        discountAmount: Number(discountAmount || 0),
        discountReason,
      }),
    });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Failed" });
      return;
    }
    setMsg({
      type: "ok",
      text: `Created ${data.createdCount} invoice(s) (${data.skippedCount} skipped — already billed or missing fee structure).`,
    });
    loadInvoices();
  }

  async function applyDiscount(inv: InvoiceRow) {
    const amt = window.prompt(
      `Enter discount amount for ${inv.student.fullName} (Invoice ${inv.invoiceNo}):`,
      (inv.discountCents / 100).toFixed(2)
    );
    if (amt === null) return;
    const reason = window.prompt(
      "Discount reason (optional):",
      inv.discountReason ?? "Sibling / Scholarship"
    );
    const res = await fetch(`/api/accountant/invoices/${inv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discountAmount: Number(amt),
        discountReason: reason ?? "",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Failed to update discount" });
      return;
    }
    setMsg({ type: "ok", text: `Updated discount on ${inv.invoiceNo}.` });
    loadInvoices();
  }

  async function cancelInvoice(inv: InvoiceRow) {
    if (!window.confirm(`Cancel invoice ${inv.invoiceNo}?`)) return;
    const res = await fetch(`/api/accountant/invoices/${inv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Failed to cancel invoice" });
      return;
    }
    setMsg({ type: "ok", text: `Cancelled invoice ${inv.invoiceNo}.` });
    loadInvoices();
  }

  return (
    <div>
      <PageHeader
        title="Invoices & Bulk Billing"
        subtitle="Generate term fee invoices for a student, a class, or the whole school"
      />

      {msg && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            msg.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      <Card title="Generate Term Invoices" className="mb-6">
        <form
          onSubmit={handleGenerate}
          className="grid gap-3 sm:grid-cols-6 sm:items-end"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Term
            </label>
            <select
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Class
            </label>
            <select
              disabled={Boolean(studentId)}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="">Whole School (All Active)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Or Single Student
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— Bulk by Class —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.class.name})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Discount
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Discount Reason
            </label>
            <input
              type="text"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="e.g. Sibling discount"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={generating}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {generating ? "Generating..." : "Generate"}
          </button>
        </form>
      </Card>

      <Card
        title="All Invoices"
        action={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadInvoices();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search student or invoice..."
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium"
            >
              Search
            </button>
          </form>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
              <tr>
                <th className="py-2 pr-3">Invoice No</th>
                <th className="py-2 pr-3">Student</th>
                <th className="py-2 pr-3">Class</th>
                <th className="py-2 pr-3">Term</th>
                <th className="py-2 pr-3 text-right">Discount</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3 text-right">Paid</th>
                <th className="py-2 pr-3 text-right">Balance</th>
                <th className="py-2 pr-3 text-right">Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2.5 pr-3 font-mono text-xs text-slate-600">
                    {inv.invoiceNo}
                  </td>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-slate-900">
                      {inv.student.fullName}
                    </p>
                    <p className="font-mono text-xs text-slate-400">
                      {inv.student.admissionNo}
                    </p>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">
                    {inv.student.class.name}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">{inv.term.name}</td>
                  <td className="py-2.5 pr-3 text-right text-slate-500 tabular-nums">
                    {inv.discountCents > 0
                      ? formatCurrency(inv.discountCents)
                      : "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {formatCurrency(inv.totalCents)}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-emerald-700 tabular-nums">
                    {formatCurrency(inv.paidCents)}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold text-rose-700 tabular-nums">
                    {formatCurrency(inv.totalCents - inv.paidCents)}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <StatusBadge value={inv.status} />
                  </td>
                  <td className="py-2.5 text-right">
                    {inv.status !== "CANCELLED" && (
                      <div className="inline-flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => applyDiscount(inv)}
                          className="rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Discount
                        </button>
                        {inv.paidCents === 0 && (
                          <button
                            type="button"
                            onClick={() => cancelInvoice(inv)}
                            className="rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
