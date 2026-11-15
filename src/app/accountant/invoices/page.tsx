"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import {
  formatCurrency,
  isBusFeeItem,
  normalizeFeeItemName,
} from "@/lib/domain";
import { Pencil, Plus, Trash2, X } from "lucide-react";

type FeeStructureOption = {
  id: string;
  name: string;
  amountCents: number;
  isBusFee?: boolean;
  class: { id: string; name: string };
  term: { id: string; name: string };
};

type InvoiceItemRow = {
  id: string;
  feeStructureId?: string | null;
  name: string;
  amountCents: number;
  allocations?: { id: string; amountCents: number }[];
};

type InvoiceRow = {
  id: string;
  invoiceNo: string;
  title: string;
  subtotalCents: number;
  totalCents: number;
  paidCents: number;
  discountCents: number;
  discountReason: string | null;
  status: string;
  term: { id: string; name: string };
  items?: InvoiceItemRow[];
  student: {
    admissionNo: string;
    fullName: string;
    usesBus?: boolean;
    busFeeCents?: number | null;
    class: { id: string; name: string };
  };
};

type StudentOption = {
  id: string;
  admissionNo: string;
  fullName: string;
  usesBus?: boolean;
  busFeeCents?: number | null;
  class: { id: string; name: string };
};

type EditInvoiceItem = {
  id?: string;
  feeStructureId?: string | null;
  name: string;
  amount: string;
  allocatedPaidCents: number;
};

type EditInvoiceState = {
  id: string;
  invoiceNo: string;
  studentName: string;
  classId: string;
  termId: string;
  discountAmount: string;
  discountReason: string;
  items: EditInvoiceItem[];
};

export default function AccountantInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [feeStructures, setFeeStructures] = useState<FeeStructureOption[]>([]);
  const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [selectedFeeIds, setSelectedFeeIds] = useState<string[]>([]);
  const [discountAmount, setDiscountAmount] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<EditInvoiceState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
      setFeeStructures(fsData.structures ?? []);
      setTerms(fsData.terms ?? []);
      setClasses(fsData.classes ?? []);
      setStudents(stuData.students ?? []);
      if (fsData.terms?.length) setTermId(fsData.terms[0].id);
    });
    loadInvoices();
  }, []);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === studentId) ?? null,
    [students, studentId]
  );

  const effectiveClassId = selectedStudent ? selectedStudent.class.id : classId;

  const termStructures = useMemo(
    () => feeStructures.filter((f) => f.term?.id === termId),
    [feeStructures, termId]
  );

  const classStructures = useMemo(
    () =>
      effectiveClassId
        ? termStructures.filter((f) => f.class?.id === effectiveClassId)
        : [],
    [termStructures, effectiveClassId]
  );

  const groupedSchoolStructures = useMemo(() => {
    if (effectiveClassId) return [];
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        isBusFee: boolean;
        ids: string[];
        minCents: number;
        maxCents: number;
        classNames: string[];
      }
    >();
    for (const s of termStructures) {
      const key = normalizeFeeItemName(s.name);
      const bus = isBusFeeItem(s);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          name: s.name,
          isBusFee: bus,
          ids: [s.id],
          minCents: s.amountCents,
          maxCents: s.amountCents,
          classNames: [s.class.name],
        });
      } else {
        existing.ids.push(s.id);
        existing.isBusFee = existing.isBusFee || bus;
        existing.minCents = Math.min(existing.minCents, s.amountCents);
        existing.maxCents = Math.max(existing.maxCents, s.amountCents);
        if (!existing.classNames.includes(s.class.name)) {
          existing.classNames.push(s.class.name);
        }
      }
    }
    return Array.from(map.values());
  }, [termStructures, effectiveClassId]);

  const availableStructureIds = useMemo(
    () =>
      effectiveClassId
        ? classStructures.map((s) => s.id)
        : termStructures.map((s) => s.id),
    [effectiveClassId, classStructures, termStructures]
  );

  // Default to all available fee structures whenever the target term/class/student scope changes
  useEffect(() => {
    setSelectedFeeIds(availableStructureIds);
  }, [termId, effectiveClassId, feeStructures.length]);

  const activeSelectedIds = useMemo(() => {
    const avail = new Set(availableStructureIds);
    return selectedFeeIds.filter((id) => avail.has(id));
  }, [selectedFeeIds, availableStructureIds]);

  const selectedEstimatedTotalCents = useMemo(() => {
    if (!effectiveClassId) return null;
    const selectedSet = new Set(activeSelectedIds);
    return classStructures
      .filter((s) => selectedSet.has(s.id))
      .reduce((sum, s) => {
        if (isBusFeeItem(s) && selectedStudent) {
          if (!selectedStudent.usesBus) return sum;
          if (selectedStudent.busFeeCents && selectedStudent.busFeeCents > 0) {
            return sum + selectedStudent.busFeeCents;
          }
        }
        return sum + s.amountCents;
      }, 0);
  }, [effectiveClassId, activeSelectedIds, classStructures, selectedStudent]);

  function toggleIds(ids: string[]) {
    setSelectedFeeIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return Array.from(next);
    });
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (activeSelectedIds.length === 0) {
      setMsg({
        type: "err",
        text: "Select at least one fee structure to invoice.",
      });
      return;
    }

    setGenerating(true);
    const res = await fetch("/api/accountant/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termId,
        classId: studentId ? "" : classId,
        studentId,
        feeStructureIds: activeSelectedIds,
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
      text: `Created ${data.createdCount} invoice(s) (${data.skippedCount} skipped — selected fee structure already billed or not applicable).`,
    });
    loadInvoices();
  }

  function openEditInvoice(inv: InvoiceRow) {
    const items: EditInvoiceItem[] =
      inv.items && inv.items.length > 0
        ? inv.items.map((it) => ({
            id: it.id,
            feeStructureId: it.feeStructureId ?? null,
            name: it.name,
            amount: (it.amountCents / 100).toFixed(2),
            allocatedPaidCents: (it.allocations ?? []).reduce(
              (s, a) => s + a.amountCents,
              0
            ),
          }))
        : [
            {
              name: "Tuition Fee",
              amount: (inv.subtotalCents / 100).toFixed(2),
              allocatedPaidCents: 0,
            },
          ];

    setEditing({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      studentName: inv.student.fullName,
      classId: inv.student.class.id,
      termId: inv.term.id,
      discountAmount: (inv.discountCents / 100).toFixed(2),
      discountReason: inv.discountReason ?? "",
      items,
    });
  }

  async function saveEditInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setMsg(null);
    setSavingEdit(true);
    const res = await fetch(`/api/accountant/invoices/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateInvoice",
        discountAmount: Number(editing.discountAmount || 0),
        discountReason: editing.discountReason,
        items: editing.items.map((it) => ({
          ...(it.id ? { id: it.id } : {}),
          feeStructureId: it.feeStructureId ?? null,
          name: it.name,
          amount: Number(it.amount || 0),
        })),
      }),
    });
    const data = await res.json();
    setSavingEdit(false);
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Failed to update invoice" });
      return;
    }
    setEditing(null);
    setMsg({ type: "ok", text: `Updated invoice ${editing.invoiceNo}.` });
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

  async function deleteInvoice(inv: InvoiceRow) {
    if (
      !window.confirm(
        `Permanently delete invoice ${inv.invoiceNo} for ${inv.student.fullName}?`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/accountant/invoices/${inv.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Failed to delete invoice" });
      return;
    }
    setMsg({ type: "ok", text: `Deleted invoice ${inv.invoiceNo}.` });
    loadInvoices();
  }

  const editingClassFeeStructures = useMemo(() => {
    if (!editing) return [];
    const matching = feeStructures.filter(
      (f) => f.term?.id === editing.termId && f.class?.id === editing.classId
    );
    return matching.length > 0
      ? matching
      : feeStructures.filter((f) => f.term?.id === editing.termId);
  }, [editing, feeStructures]);

  return (
    <div>
      <PageHeader
        title="Invoices & Bulk Billing"
        subtitle="Choose which fee structures to invoice for a student, a class, or the whole school"
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
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-6 sm:items-end">
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
              disabled={generating || availableStructureIds.length === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {generating ? "Generating..." : "Generate"}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-800 uppercase">
                  Fee Structures to Invoice
                </p>
                <p className="text-[11px] text-slate-500">
                  Choose one, several, or all fee structures to include in generated invoices
                </p>
              </div>
              {availableStructureIds.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  {selectedEstimatedTotalCents !== null && (
                    <span className="rounded-md bg-white px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-200 tabular-nums">
                      Selected Subtotal: {formatCurrency(selectedEstimatedTotalCents)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedFeeIds(availableStructureIds)}
                    className="rounded border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFeeIds([])}
                    className="rounded border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {availableStructureIds.length === 0 ? (
              <p className="text-xs text-slate-500">
                No fee structures configured for this selection.{" "}
                <Link
                  href="/accountant/fee-structures"
                  className="font-semibold text-indigo-600 hover:underline"
                >
                  Configure Fee Structures →
                </Link>
              </p>
            ) : effectiveClassId ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {classStructures.map((s) => {
                  const checked = activeSelectedIds.includes(s.id);
                  const bus = isBusFeeItem(s);
                  const nonBusStudentSkip = Boolean(
                    selectedStudent && bus && !selectedStudent.usesBus
                  );
                  const displayCents =
                    selectedStudent &&
                    bus &&
                    selectedStudent.usesBus &&
                    selectedStudent.busFeeCents &&
                    selectedStudent.busFeeCents > 0
                      ? selectedStudent.busFeeCents
                      : s.amountCents;

                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                        checked
                          ? "border-indigo-300 bg-white shadow-2xs"
                          : "border-slate-200 bg-slate-100/70 opacity-80"
                      }`}
                    >
                      <label className="flex flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleIds([s.id])}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-slate-900">
                              {s.name}
                            </span>
                            {bus && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                Bus Only
                              </span>
                            )}
                          </div>
                          {nonBusStudentSkip && (
                            <span className="block text-[10px] text-slate-500">
                              Skipped for {selectedStudent?.fullName} (not on bus)
                            </span>
                          )}
                        </div>
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 tabular-nums">
                          {formatCurrency(displayCents)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedFeeIds([s.id])}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50"
                          title={`Invoice only ${s.name}`}
                        >
                          Only
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {groupedSchoolStructures.map((g) => {
                  const checked = g.ids.every((id) =>
                    activeSelectedIds.includes(id)
                  );
                  const amountLabel =
                    g.minCents === g.maxCents
                      ? formatCurrency(g.minCents)
                      : `${formatCurrency(g.minCents)}–${formatCurrency(g.maxCents)}`;
                  return (
                    <div
                      key={g.key}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                        checked
                          ? "border-indigo-300 bg-white shadow-2xs"
                          : "border-slate-200 bg-slate-100/70 opacity-80"
                      }`}
                    >
                      <label className="flex flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleIds(g.ids)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-slate-900">
                              {g.name}
                            </span>
                            {g.isBusFee && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                Bus Only
                              </span>
                            )}
                          </div>
                          <span className="block text-[10px] text-slate-500">
                            {g.classNames.length} class
                            {g.classNames.length === 1 ? "" : "es"}
                          </span>
                        </div>
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 tabular-nums">
                          {amountLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedFeeIds(g.ids)}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50"
                          title={`Invoice only ${g.name}`}
                        >
                          Only
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-slate-900">
                        {inv.student?.fullName ?? "—"}
                      </p>
                      {inv.student?.usesBus && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          Bus
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-slate-400">
                      {inv.student?.admissionNo ?? ""}
                    </p>
                    {inv.items && inv.items.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {inv.items.map((it) => {
                          const itemPaid = (it.allocations ?? []).reduce(
                            (s, a) => s + a.amountCents,
                            0
                          );
                          const paidInFull =
                            inv.status === "PAID" || itemPaid >= it.amountCents;
                          return (
                            <span
                              key={it.id}
                              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                paidInFull
                                  ? "bg-emerald-50 text-emerald-700"
                                  : itemPaid > 0
                                    ? "bg-amber-50 text-amber-800"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {it.name}: {formatCurrency(it.amountCents)}
                              {itemPaid > 0 && itemPaid < it.amountCents
                                ? ` (Paid ${formatCurrency(itemPaid)})`
                                : itemPaid >= it.amountCents
                                  ? " ✓"
                                  : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">
                    {inv.student?.class?.name ?? "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">{inv.term?.name ?? "—"}</td>
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
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditInvoice(inv)}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        title="Edit invoice items and discount"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      {inv.status !== "CANCELLED" && inv.paidCents === 0 && (
                        <button
                          type="button"
                          onClick={() => cancelInvoice(inv)}
                          className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteInvoice(inv)}
                        className="inline-flex items-center rounded border border-rose-200 bg-rose-50 p-1 text-rose-700 hover:bg-rose-100"
                        title="Delete invoice"
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

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Edit Invoice ({editing.invoiceNo})
                </h2>
                <p className="text-xs text-slate-500">{editing.studentName}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={saveEditInvoice} className="space-y-4">
              {editingClassFeeStructures.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="mb-1.5 block text-[11px] font-semibold text-slate-600 uppercase">
                    Add Fee Structure Item
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {editingClassFeeStructures.map((fs) => (
                      <button
                        key={fs.id}
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...editing,
                            items: [
                              ...editing.items,
                              {
                                feeStructureId: fs.id,
                                name: fs.name,
                                amount: (fs.amountCents / 100).toFixed(2),
                                allocatedPaidCents: 0,
                              },
                            ],
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                      >
                        <Plus className="h-3 w-3" />
                        {fs.name} ({formatCurrency(fs.amountCents)})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 uppercase">
                    Fee Line Items
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        items: [
                          ...editing.items,
                          {
                            name: "Custom Fee",
                            amount: "20.00",
                            allocatedPaidCents: 0,
                          },
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-slate-50"
                  >
                    <Plus className="h-3 w-3" />
                    Add Custom Item
                  </button>
                </div>
                <div className="space-y-2">
                  {editing.items.map((it, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          required
                          value={it.name}
                          onChange={(e) => {
                            const next = [...editing.items];
                            next[idx] = { ...it, name: e.target.value };
                            setEditing({ ...editing, items: next });
                          }}
                          placeholder="Item name (e.g. Tuition Fee, Bus Fee)"
                          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min={(it.allocatedPaidCents / 100).toFixed(2)}
                          required
                          value={it.amount}
                          onChange={(e) => {
                            const next = [...editing.items];
                            next[idx] = { ...it, amount: e.target.value };
                            setEditing({ ...editing, items: next });
                          }}
                          placeholder="Amount"
                          className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums"
                        />
                        <button
                          type="button"
                          disabled={
                            editing.items.length <= 1 || it.allocatedPaidCents > 0
                          }
                          onClick={() =>
                            setEditing({
                              ...editing,
                              items: editing.items.filter((_, i) => i !== idx),
                            })
                          }
                          className="rounded p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                          title={
                            it.allocatedPaidCents > 0
                              ? "Cannot remove an item that already has payments recorded"
                              : "Remove line item"
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {it.allocatedPaidCents > 0 && (
                        <p className="text-[11px] text-emerald-700">
                          Already paid toward this item:{" "}
                          {formatCurrency(it.allocatedPaidCents)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Discount Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editing.discountAmount}
                    onChange={(e) =>
                      setEditing({ ...editing, discountAmount: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Discount Reason
                  </label>
                  <input
                    type="text"
                    value={editing.discountReason}
                    onChange={(e) =>
                      setEditing({ ...editing, discountReason: e.target.value })
                    }
                    placeholder="Optional reason"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {savingEdit ? "Saving..." : "Save Invoice Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
