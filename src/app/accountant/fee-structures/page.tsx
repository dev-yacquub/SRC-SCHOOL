"use client";

import React, { useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { formatCurrency } from "@/lib/domain";
import { Pencil, Trash2 } from "lucide-react";

type FeeStructure = {
  id: string;
  name: string;
  amountCents: number;
  isBusFee?: boolean;
  class: { id: string; name: string };
  term: { id: string; name: string };
};

export default function FeeStructuresPage() {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [name, setName] = useState("Tuition Fee");
  const [amount, setAmount] = useState("60");
  const [isBusFee, setIsBusFee] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function loadAll() {
    const res = await fetch("/api/accountant/fee-structures");
    if (!res.ok) return;
    const data = await res.json();
    setStructures(data.structures ?? []);
    setClasses(data.classes ?? []);
    setTerms(data.terms ?? []);
    if (data.classes?.length) setClassId((p) => p || data.classes[0].id);
    if (data.terms?.length) setTermId((p) => p || data.terms[0].id);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/accountant/fee-structures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(editingId ? { id: editingId } : {}),
        classId,
        termId,
        name,
        amount: Number(amount),
        isBusFee,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Failed" });
      return;
    }
    setEditingId(null);
    setMsg({ type: "ok", text: "Fee structure item saved." });
    loadAll();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this fee structure item?")) return;
    await fetch(`/api/accountant/fee-structures?id=${id}`, { method: "DELETE" });
    if (editingId === id) setEditingId(null);
    loadAll();
  }

  return (
    <div>
      <PageHeader
        title="Fee Structures"
        subtitle="Define term tuition and extra fee items per class"
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Add / Update Fee Item" className="lg:col-span-1">
          <form onSubmit={handleSave} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Class
              </label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
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
                Fee Name (e.g. Tuition Fee, Bus Fee, Exam Fee)
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  const val = e.target.value;
                  setName(val);
                  if (/\b(bus|transport)\b/i.test(val)) {
                    setIsBusFee(true);
                  }
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setName("Tuition Fee");
                    setIsBusFee(false);
                  }}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                >
                  + Tuition Fee
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setName("Bus Fee");
                    setIsBusFee(true);
                  }}
                  className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
                >
                  + Bus Fee (Bus Students Only)
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={isBusFee}
                onChange={(e) => setIsBusFee(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600"
              />
              <span>
                <strong className="font-semibold text-slate-900">
                  Bus Students Only
                </strong>
                <span className="block text-[11px] text-slate-500">
                  Only added to invoices for students marked as using the school bus
                </span>
              </span>
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                {editingId ? "Update Fee Item" : "Save Fee Item"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setName("Tuition Fee");
                    setAmount("60");
                    setIsBusFee(false);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </Card>

        <Card title="Configured Fee Items" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-4">Term</th>
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4">Fee Item</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {structures.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-4 text-slate-600">{s.term?.name ?? "—"}</td>
                    <td className="py-2.5 pr-4 font-medium text-slate-900">
                      {s.class?.name ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700">
                      <span>{s.name}</span>
                      {(s.isBusFee || /\b(bus|transport)\b/i.test(s.name)) && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          Bus Students Only
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-semibold tabular-nums">
                      {formatCurrency(s.amountCents)}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(s.id);
                            setClassId(s.class.id);
                            setTermId(s.term.id);
                            setName(s.name);
                            setAmount((s.amountCents / 100).toFixed(2));
                            setIsBusFee(
                              Boolean(
                                s.isBusFee || /\b(bus|transport)\b/i.test(s.name)
                              )
                            );
                          }}
                          className="text-slate-400 hover:text-indigo-600"
                          title="Edit fee item"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id)}
                          className="text-slate-400 hover:text-rose-600"
                          title="Delete fee item"
                        >
                          <Trash2 className="h-4 w-4" />
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
    </div>
  );
}

