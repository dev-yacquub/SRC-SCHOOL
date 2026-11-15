"use client";

import React, { useEffect, useState } from "react";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { formatCurrency } from "@/lib/domain";
import { Pencil, Trash2 } from "lucide-react";

type ExpenseRow = {
  id: string;
  title: string;
  category: string;
  amountCents: number;
  date: string;
  note: string | null;
};

export default function AccountantExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Supplies");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function loadExpenses() {
    const res = await fetch("/api/accountant/expenses");
    if (res.ok) {
      const data = await res.json();
      setExpenses(data.expenses ?? []);
    }
  }

  useEffect(() => {
    loadExpenses();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/accountant/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(editingId ? { id: editingId } : {}),
        title,
        category,
        amount: Number(amount),
        date,
        note,
      }),
    });
    if (res.ok) {
      setEditingId(null);
      setTitle("");
      setAmount("");
      setNote("");
      setMsg(editingId ? "Expense updated." : "Expense recorded.");
      loadExpenses();
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this expense entry?")) return;
    await fetch(`/api/accountant/expenses?id=${id}`, { method: "DELETE" });
    if (editingId === id) setEditingId(null);
    loadExpenses();
  }

  const totalCents = expenses.reduce((s, e) => s + e.amountCents, 0);

  return (
    <div>
      <PageHeader
        title="School Expenses"
        subtitle="Track operational expenses for simple income vs. expense overview"
      />

      {msg && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {msg}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Total Recorded Expenses"
          value={formatCurrency(totalCents)}
          tone="rose"
        />
        <StatCard label="Expense Entries" value={expenses.length} tone="slate" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Record Expense" className="lg:col-span-1">
          <form onSubmit={handleAdd} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Electricity bill"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="Supplies">Supplies</option>
                <option value="Utilities">Utilities</option>
                <option value="Academics">Academics</option>
                <option value="Maintenance">Maintenance</option>
                <option value="General">General</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
              </div>
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
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                {editingId ? "Update Expense" : "Add Expense"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setTitle("");
                    setAmount("");
                    setNote("");
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </Card>

        <Card title="Expense Ledger" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((ex) => (
                  <tr key={ex.id}>
                    <td className="py-2.5 pr-3 text-xs text-slate-500 tabular-nums">
                      {new Date(ex.date).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">
                      {ex.title}
                      {ex.note && (
                        <span className="block text-xs font-normal text-slate-500">
                          {ex.note}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{ex.category}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold text-rose-700 tabular-nums">
                      {formatCurrency(ex.amountCents)}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(ex.id);
                            setTitle(ex.title);
                            setCategory(ex.category);
                            setAmount((ex.amountCents / 100).toFixed(2));
                            setDate(ex.date ? ex.date.slice(0, 10) : "");
                            setNote(ex.note ?? "");
                          }}
                          className="text-slate-400 hover:text-indigo-600"
                          title="Edit expense"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ex.id)}
                          className="text-slate-400 hover:text-rose-600"
                          title="Delete expense"
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

