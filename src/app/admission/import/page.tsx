"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { Download, Upload, CheckCircle2, Printer } from "lucide-react";

type PreviewRow = {
  rowNumber: number;
  fullName: string;
  gender: "MALE" | "FEMALE";
  dob: string | null;
  guardianName: string;
  guardianPhone: string;
  className: string;
  admissionDate: string;
};

type PreviewResponse = {
  preview: true;
  validCount: number;
  validRows: PreviewRow[];
  errors: string[];
};

type ImportResponse = {
  importedCount: number;
  defaultPassword?: string;
  createdAccounts: {
    id: string;
    admissionNo: string;
    fullName: string;
    className: string;
    username: string;
    temporaryPassword?: string;
  }[];
  errors: string[];
};

export default function ImportStudentsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function handleValidate(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setResult(null);
    setPreview(null);
    setChecking(true);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/admission/import?preview=true", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setChecking(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to validate spreadsheet");
      return;
    }
    setPreview(data);
  }

  async function handleConfirmImport() {
    if (!file) return;
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/admission/import", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setUploading(false);

    if (!res.ok) {
      setError(data.error ?? "Import failed");
      return;
    }
    setPreview(null);
    setResult(data);
  }

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Import Students from Excel"
          subtitle="Download the Excel template, preview and validate rows, then create students & logins in bulk"
          action={
            <a
              href="/api/admission/import"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Download Template (.xlsx)
            </a>
          }
        />
      </div>

      {error && (
        <div className="no-print mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <Card className="no-print mb-6 max-w-xl">
        <form onSubmit={handleValidate} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Select Excel Spreadsheet (.xlsx)
            </label>
            <input
              type="file"
              accept=".xlsx"
              required
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
                setError(null);
              }}
              className="block w-full rounded-lg border border-slate-300 p-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={!file || checking || uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            {checking ? "Validating..." : "Preview & Validate File"}
          </button>
        </form>
      </Card>

      {preview && (
        <Card
          title={`Preview: ${preview.validCount} Valid Row(s) Ready`}
          subtitle={
            preview.errors.length > 0
              ? `${preview.errors.length} row(s) have validation warnings and will be skipped`
              : "All rows look valid and ready to import"
          }
          action={
            <button
              type="button"
              disabled={preview.validCount === 0 || uploading}
              onClick={handleConfirmImport}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {uploading
                ? "Importing..."
                : `Confirm & Import ${preview.validCount} Student(s)`}
            </button>
          }
          className="no-print mb-6"
        >
          {preview.errors.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold">Rows with Issues (will be skipped):</p>
              <ul className="mt-1 list-disc pl-4">
                {preview.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          {preview.validRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2 pr-3">Row</th>
                    <th className="py-2 pr-3">Full Name</th>
                    <th className="py-2 pr-3">Gender</th>
                    <th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3">Guardian</th>
                    <th className="py-2">Adm Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.validRows.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="py-2 pr-3 text-xs text-slate-400">#{r.rowNumber}</td>
                      <td className="py-2 pr-3 font-medium text-slate-900">
                        {r.fullName}
                      </td>
                      <td className="py-2 pr-3 text-xs">{r.gender}</td>
                      <td className="py-2 pr-3 text-slate-700">{r.className}</td>
                      <td className="py-2 pr-3 text-xs text-slate-600">
                        {r.guardianName} ({r.guardianPhone})
                      </td>
                      <td className="py-2 font-mono text-xs text-slate-500">
                        {r.admissionDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {result && (
        <Card
          title={`Imported ${result.importedCount} Students`}
          subtitle="Each imported student has been assigned a unique temporary password (must be changed on first login)"
          action={
            <div className="no-print flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Printer className="h-3.5 w-3.5" />
                Print Login Credentials
              </button>
              <Link
                href="/admission/students"
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Open Directory
              </Link>
            </div>
          }
        >
          {result.errors.length > 0 && (
            <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold">Skipped Rows:</p>
              <ul className="mt-1 list-disc pl-4">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-4">Admission No</th>
                  <th className="py-2 pr-4">Full Name</th>
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4">Username</th>
                  <th className="py-2">Temp Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.createdAccounts.map((acc) => (
                  <tr key={acc.admissionNo}>
                    <td className="py-2 pr-4 font-mono text-xs">{acc.admissionNo}</td>
                    <td className="py-2 pr-4 font-medium">
                      <Link
                        href={`/admission/students/${acc.id}`}
                        className="hover:text-indigo-600 hover:underline"
                      >
                        {acc.fullName}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{acc.className}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600">
                      {acc.username}
                    </td>
                    <td className="py-2 font-mono text-xs text-slate-700">
                      {acc.temporaryPassword ?? result.defaultPassword}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
