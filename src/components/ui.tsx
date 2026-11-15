"use client";

import React from "react";
import { Printer } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-xs ${className}`}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            )}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "indigo",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "indigo" | "emerald" | "amber" | "rose" | "slate";
}) {
  const accent: Record<string, string> = {
    indigo: "border-l-indigo-600 text-indigo-700",
    emerald: "border-l-emerald-600 text-emerald-700",
    amber: "border-l-amber-500 text-amber-700",
    rose: "border-l-rose-600 text-rose-700",
    slate: "border-l-slate-600 text-slate-700",
  };
  return (
    <div
      className={`rounded-xl border border-slate-200 border-l-4 bg-white p-5 shadow-xs ${accent[tone]}`}
    >
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    PAID: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    PRESENT: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    PUBLISHED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    PARTIAL: "bg-amber-50 text-amber-700 ring-amber-600/20",
    LOCKED: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
    GRADUATED: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
    UNPAID: "bg-rose-50 text-rose-700 ring-rose-600/20",
    ABSENT: "bg-rose-50 text-rose-700 ring-rose-600/20",
    WITHDRAWN: "bg-rose-50 text-rose-700 ring-rose-600/20",
    TRANSFERRED: "bg-slate-100 text-slate-700 ring-slate-500/20",
    INACTIVE: "bg-slate-100 text-slate-600 ring-slate-500/20",
    CANCELLED: "bg-slate-100 text-slate-600 ring-slate-500/20",
    DRAFT: "bg-slate-100 text-slate-600 ring-slate-500/20",
  };
  const cls =
    styles[value] ?? "bg-slate-100 text-slate-700 ring-slate-500/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {value}
    </span>
  );
}

export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
    >
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}

