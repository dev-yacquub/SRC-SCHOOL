"use client";

import React, { useEffect, useState } from "react";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { formatCurrency } from "@/lib/domain";
import { Download } from "lucide-react";

type InvoiceRow = {
  id: string;
  invoiceNo: string;
  totalCents: number;
  paidCents: number;
  status: string;
  term: { name: string };
  student: {
    admissionNo: string;
    fullName: string;
    class: { name: string };
  };
};

export default function AccountantBalancesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");

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
                <th className="py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => {
                const rem = inv.totalCents - inv.paidCents;
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
                    <td className="py-2.5 pr-4 text-slate-600">{inv.term.name}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {formatCurrency(inv.totalCents)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-emerald-700 tabular-nums">
                      {formatCurrency(inv.paidCents)}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-bold text-rose-700 tabular-nums">
                      {formatCurrency(rem)}
                    </td>
                    <td className="py-2.5 text-right">
                      <StatusBadge value={inv.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

