"use client";

import React, { useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";

export default function AdminSettingsPage() {
  const [form, setForm] = useState({
    schoolName: "",
    schoolAddress: "",
    schoolPhone: "",
    schoolEmail: "",
    currency: "USD",
    currencySymbol: "$",
    admissionPrefix: "ADM",
    invoicePrefix: "INV",
    receiptPrefix: "RCT",
  });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setForm({
            schoolName: d.settings.schoolName,
            schoolAddress: d.settings.schoolAddress,
            schoolPhone: d.settings.schoolPhone,
            schoolEmail: d.settings.schoolEmail,
            currency: d.settings.currency,
            currencySymbol: d.settings.currencySymbol,
            admissionPrefix: d.settings.admissionPrefix,
            invoicePrefix: d.settings.invoicePrefix,
            receiptPrefix: d.settings.receiptPrefix,
          });
        }
        setLoading(false);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Failed to save" });
      return;
    }
    setMsg({ type: "ok", text: "School settings saved." });
  }

  return (
    <div>
      <PageHeader
        title="School Settings"
        subtitle="Configure school identity, currency, and document number prefixes"
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

      <Card className="max-w-2xl">
        {loading ? (
          <p className="text-sm text-slate-500">Loading settings...</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                School Name
              </label>
              <input
                type="text"
                required
                value={form.schoolName}
                onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Phone
                </label>
                <input
                  type="text"
                  required
                  value={form.schoolPhone}
                  onChange={(e) => setForm({ ...form, schoolPhone: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={form.schoolEmail}
                  onChange={(e) => setForm({ ...form, schoolEmail: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Address
              </label>
              <input
                type="text"
                required
                value={form.schoolAddress}
                onChange={(e) => setForm({ ...form, schoolAddress: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Currency Code (e.g. USD, SOS)
                </label>
                <input
                  type="text"
                  required
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Currency Symbol (e.g. $)
                </label>
                <input
                  type="text"
                  required
                  value={form.currencySymbol}
                  onChange={(e) =>
                    setForm({ ...form, currencySymbol: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Admission Prefix
                </label>
                <input
                  type="text"
                  required
                  value={form.admissionPrefix}
                  onChange={(e) =>
                    setForm({ ...form, admissionPrefix: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Invoice Prefix
                </label>
                <input
                  type="text"
                  required
                  value={form.invoicePrefix}
                  onChange={(e) =>
                    setForm({ ...form, invoicePrefix: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Receipt Prefix
                </label>
                <input
                  type="text"
                  required
                  value={form.receiptPrefix}
                  onChange={(e) =>
                    setForm({ ...form, receiptPrefix: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Save Settings
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}

