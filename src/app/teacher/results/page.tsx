"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getOrdinalSuffix } from "@/lib/domain";
import { Card, PageHeader } from "@/components/ui";
import {
  AlertCircle,
  Award,
  Download,
  Lock,
  Printer,
  Save,
  Search,
} from "lucide-react";

type ClassOption = { id: string; name: string; level: number };
type ExamOption = {
  id: string;
  name: string;
  maxMarks: number;
  isLocked: boolean;
  isPublished: boolean;
  term: { name: string };
};
type SubjectCol = { id: string; name: string; code: string };
type BroadsheetRow = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  subjectScores: Record<string, number | null>;
  totalObtained: number;
  totalMax: number;
  percentage: number | null;
  grade: string | null;
  rank: number | null;
  outOf: number;
  teacherRemark: string;
  principalRemark: string;
};

type RemarkDraft = {
  teacherRemark: string;
  principalRemark: string;
};

export default function TeacherResultsBroadsheetPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedExam, setSelectedExam] = useState<ExamOption | null>(null);
  const [subjects, setSubjects] = useState<SubjectCol[]>([]);
  const [rows, setRows] = useState<BroadsheetRow[]>([]);
  const [classAveragePercent, setClassAveragePercent] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  const [remarksDraft, setRemarksDraft] = useState<Record<string, RemarkDraft>>({});
  const [initialRemarks, setInitialRemarks] = useState<Record<string, RemarkDraft>>({});

  const [sortBy, setSortBy] = useState<"rank" | "name">("rank");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function loadBroadsheet(
    targetClassId: string,
    targetExamId: string,
    keepMessage = false
  ) {
    setLoading(true);
    if (!keepMessage) setMessage(null);
    try {
      const qs = new URLSearchParams();
      if (targetClassId) qs.set("classId", targetClassId);
      if (targetExamId) qs.set("examId", targetExamId);

      const res = await fetch(`/api/teacher/broadsheet?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "err",
          text: data.error ?? "Failed to load class broadsheet",
        });
        setLoading(false);
        return;
      }

      setClasses(data.classes ?? []);
      setExams(data.exams ?? []);
      setSelectedClassId(data.selectedClassId ?? "");
      setSelectedExam(data.selectedExam ?? null);
      setSubjects(data.subjects ?? []);
      setRows(data.rows ?? []);
      setClassAveragePercent(data.classAveragePercent ?? 0);
      setIsAdmin(Boolean(data.isAdmin));

      const draft: Record<string, RemarkDraft> = {};
      const snap: Record<string, RemarkDraft> = {};
      for (const r of (data.rows ?? []) as BroadsheetRow[]) {
        const item = {
          teacherRemark: r.teacherRemark ?? "",
          principalRemark: r.principalRemark ?? "",
        };
        draft[r.studentId] = { ...item };
        snap[r.studentId] = { ...item };
      }
      setRemarksDraft(draft);
      setInitialRemarks(snap);
    } catch {
      setMessage({ type: "err", text: "Network error loading broadsheet" });
    }
    setLoading(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    void loadBroadsheet(
      params.get("classId") ?? "",
      params.get("examId") ?? ""
    );
  }, []);

  const examId = selectedExam?.id ?? "";
  const canEditRemarks = Boolean(
    selectedExam && selectedClassId && (!selectedExam.isLocked || isAdmin)
  );

  const hasUnsavedRemarks = rows.some((r) => {
    const cur = remarksDraft[r.studentId] ?? {
      teacherRemark: "",
      principalRemark: "",
    };
    const init = initialRemarks[r.studentId] ?? {
      teacherRemark: "",
      principalRemark: "",
    };
    return (
      cur.teacherRemark !== init.teacherRemark ||
      (isAdmin && cur.principalRemark !== init.principalRemark)
    );
  });

  function updateRemark(
    studentId: string,
    field: "teacherRemark" | "principalRemark",
    val: string
  ) {
    setRemarksDraft((prev) => ({
      ...prev,
      [studentId]: {
        teacherRemark: prev[studentId]?.teacherRemark ?? "",
        principalRemark: prev[studentId]?.principalRemark ?? "",
        [field]: val,
      },
    }));
  }

  async function saveRemarks() {
    if (!selectedExam || !selectedClassId || !canEditRemarks) return;
    setSaving(true);
    setMessage(null);
    const payload = {
      examId: selectedExam.id,
      classId: selectedClassId,
      remarks: rows.map((r) => {
        const d = remarksDraft[r.studentId] ?? {
          teacherRemark: "",
          principalRemark: "",
        };
        return {
          studentId: r.studentId,
          teacherRemark: d.teacherRemark.trim(),
          ...(isAdmin ? { principalRemark: d.principalRemark.trim() } : {}),
        };
      }),
    };

    const res = await fetch("/api/teacher/report-remarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "Failed to save remarks" });
      return;
    }

    setMessage({
      type: "ok",
      text: `Saved report card remarks for ${data.saved} students.`,
    });
    await loadBroadsheet(selectedClassId, selectedExam.id, true);
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = normalizedSearch
    ? rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(normalizedSearch) ||
        r.admissionNo.toLowerCase().includes(normalizedSearch)
    )
    : rows;

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (sortBy === "rank") {
      const ra = a.rank ?? 99999;
      const rb = b.rank ?? 99999;
      if (ra !== rb) return ra - rb;
    }
    return a.fullName.localeCompare(b.fullName);
  });

  const rankedCount = rows.filter((r) => r.rank !== null).length;
  const selectedClassName =
    classes.find((c) => c.id === selectedClassId)?.name ?? "Class";

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Class Results Broadsheet & Remarks"
          subtitle="Review class rankings, subject totals, and enter report card remarks"
          action={
            <>
              {selectedClassId && selectedExam && (
                <>
                  <a
                    href={`/api/teacher/broadsheet?classId=${encodeURIComponent(
                      selectedClassId
                    )}&examId=${encodeURIComponent(selectedExam.id)}&format=xlsx`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4" />
                    Export Excel
                  </a>
                  <Link
                    href={`/print/report-cards/${selectedClassId}/${selectedExam.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <Printer className="h-4 w-4" />
                    Print Class Report Cards
                  </Link>
                </>
              )}
            </>
          }
        />
      </div>

      {message && (
        <div
          className={`no-print mb-4 rounded-lg border px-4 py-3 text-sm ${message.type === "ok"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
        >
          {message.text}
        </div>
      )}

      <Card>
        <div className="no-print mb-4 flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Class
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => loadBroadsheet(e.target.value, examId)}
                className="min-h-[42px] w-full max-w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Examination
              </label>
              <select
                value={examId}
                onChange={(e) => loadBroadsheet(selectedClassId, e.target.value)}
                className="min-h-[42px] w-full max-w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} ({ex.term.name})
                    {ex.isLocked ? " [Locked]" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Sort Order
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "rank" | "name")}
                className="min-h-[42px] w-full max-w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
              >
                <option value="rank">Rank (1st → Last)</option>
                <option value="name">Student Name (A → Z)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Filter Student
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-3 left-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or Adm No..."
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 py-2 pr-3 pl-8 text-base sm:w-auto sm:text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasUnsavedRemarks && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                <AlertCircle className="h-3.5 w-3.5" />
                Unsaved remarks
              </span>
            )}
            {selectedExam?.isLocked && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${isAdmin
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-amber-100 text-amber-800"
                  }`}
              >
                <Lock className="h-3 w-3" />
                {isAdmin ? "Locked (Admin Override)" : "Locked by Admin"}
              </span>
            )}
            <button
              type="button"
              onClick={saveRemarks}
              disabled={!canEditRemarks || saving || rows.length === 0}
              className="hidden min-h-[40px] items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 md:inline-flex"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Remarks"}
            </button>
          </div>
        </div>

        {!loading && selectedExam && selectedClassId && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-5">
              <div>
                <span className="text-slate-500">Class:</span>{" "}
                <strong className="text-slate-900">{selectedClassName}</strong>
              </div>
              <div>
                <span className="text-slate-500">Exam:</span>{" "}
                <strong className="text-slate-900">
                  {selectedExam.name} ({selectedExam.term.name})
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Ranked Students:</span>{" "}
                <strong className="text-slate-900 tabular-nums">
                  {rankedCount} / {rows.length}
                </strong>
              </div>
              <div className="inline-flex items-center gap-1 text-indigo-700">
                <Award className="h-3.5 w-3.5" />
                <span>Class Average:</span>{" "}
                <strong className="tabular-nums">{classAveragePercent}%</strong>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 font-medium ${selectedExam.isPublished
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-200 text-slate-700"
                }`}
            >
              {selectedExam.isPublished ? "Published to Students" : "Draft / Unpublished"}
            </span>
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Calculating class broadsheet...
          </p>
        ) : !selectedClassId || !selectedExam ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Select a class and examination to view results.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No active students enrolled in {selectedClassName}.
          </p>
        ) : (
          <>
            {/* Mobile Student Result Cards */}
            <div className="space-y-3 md:hidden">
              {sortedRows.map((r) => {
                const draft = remarksDraft[r.studentId] ?? {
                  teacherRemark: "",
                  principalRemark: "",
                };
                const showPrincipalField =
                  isAdmin || Boolean(r.principalRemark);
                return (
                  <div
                    key={r.studentId}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          {r.rank ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                                r.rank === 1
                                  ? "bg-amber-100 text-amber-800"
                                  : r.rank <= 3
                                    ? "bg-indigo-100 text-indigo-700"
                                    : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {getOrdinalSuffix(r.rank)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Unranked</span>
                          )}
                          <Link
                            href={`/teacher/students/${r.studentId}`}
                            className="font-semibold text-slate-900 hover:text-indigo-600 hover:underline"
                          >
                            {r.fullName}
                          </Link>
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                          {r.admissionNo}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-indigo-700 tabular-nums">
                          {r.percentage !== null ? `${r.percentage}% (${r.grade})` : "—"}
                        </p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {r.totalMax > 0 ? `${r.totalObtained}/${r.totalMax}` : "No marks"}
                        </p>
                      </div>
                    </div>

                    {subjects.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        {subjects.map((sub) => {
                          const score = r.subjectScores[sub.id];
                          return (
                            <div
                              key={sub.id}
                              className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs"
                            >
                              <span className="block truncate text-[10px] font-medium text-slate-500">
                                {sub.code}
                              </span>
                              <span className="font-semibold text-slate-800 tabular-nums">
                                {score !== null && score !== undefined ? score : "—"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3 space-y-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-500">
                          Class Teacher Remark
                        </label>
                        <input
                          disabled={!canEditRemarks}
                          value={draft.teacherRemark}
                          onChange={(e) =>
                            updateRemark(r.studentId, "teacherRemark", e.target.value)
                          }
                          placeholder="Teacher comment..."
                          className="min-h-[40px] w-full rounded-lg border border-slate-200 px-3 py-1.5 text-base focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 sm:text-xs"
                        />
                      </div>

                      {showPrincipalField && (
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">
                            Principal Remark
                          </label>
                          {isAdmin ? (
                            <input
                              value={draft.principalRemark}
                              onChange={(e) =>
                                updateRemark(r.studentId, "principalRemark", e.target.value)
                              }
                              placeholder="Principal note..."
                              className="min-h-[40px] w-full rounded-lg border border-slate-200 px-3 py-1.5 text-base focus:border-indigo-500 focus:outline-none sm:text-xs"
                            />
                          ) : (
                            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-600">
                              {r.principalRemark || "—"}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 border-t border-slate-100 pt-2.5 text-right">
                      <Link
                        href={`/print/report-card/${r.studentId}/${selectedExam.id}`}
                        className="inline-flex min-h-[36px] items-center rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        Open Report Card PDF →
                      </Link>
                    </div>
                  </div>
                );
              })}

              {canEditRemarks && rows.length > 0 && (
                <div className="sticky bottom-[66px] z-20 -mx-1 rounded-xl border border-indigo-200 bg-white/95 p-3 shadow-md backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={saveRemarks}
                    disabled={saving}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {saving
                      ? "Saving Remarks..."
                      : hasUnsavedRemarks
                        ? "Save Unsaved Remarks"
                        : "Save Remarks"}
                  </button>
                </div>
              )}
            </div>

            {/* Desktop Broadsheet Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase">
                  <tr>
                    <th className="px-2.5 py-2.5">Rank</th>
                    <th className="px-2.5 py-2.5">Adm No</th>
                    <th className="px-2.5 py-2.5">Student</th>
                    {subjects.map((sub) => (
                      <th
                        key={sub.id}
                        title={sub.name}
                        className="px-2 py-2.5 text-right whitespace-nowrap"
                      >
                        {sub.code}
                      </th>
                    ))}
                    <th className="px-2.5 py-2.5 text-right">Total</th>
                    <th className="px-2.5 py-2.5 text-right">Avg %</th>
                    <th className="px-2.5 py-2.5 text-center">Grade</th>
                    <th className="min-w-[180px] px-2.5 py-2.5">Class Teacher Remark</th>
                    {(isAdmin || rows.some((r) => r.principalRemark)) && (
                      <th className="min-w-[180px] px-2.5 py-2.5">Principal Remark</th>
                    )}
                    <th className="no-print px-2.5 py-2.5 text-right">Card</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {sortedRows.map((r) => {
                    const draft = remarksDraft[r.studentId] ?? {
                      teacherRemark: "",
                      principalRemark: "",
                    };
                    const showPrincipalCol =
                      isAdmin || rows.some((x) => x.principalRemark);
                    return (
                      <tr key={r.studentId} className="hover:bg-slate-50/80">
                        <td className="px-2.5 py-2.5 font-semibold whitespace-nowrap tabular-nums">
                          {r.rank ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${r.rank === 1
                                ? "bg-amber-100 text-amber-800"
                                : r.rank <= 3
                                  ? "bg-indigo-100 text-indigo-700"
                                  : "bg-slate-100 text-slate-700"
                                }`}
                            >
                              {getOrdinalSuffix(r.rank)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-2.5 py-2.5 font-mono text-xs whitespace-nowrap text-slate-600">
                          {r.admissionNo}
                        </td>
                        <td className="px-2.5 py-2.5 font-medium whitespace-nowrap text-slate-900">
                          <Link
                            href={`/teacher/students/${r.studentId}`}
                            className="hover:text-indigo-600 hover:underline"
                          >
                            {r.fullName}
                          </Link>
                        </td>
                        {subjects.map((sub) => {
                          const score = r.subjectScores[sub.id];
                          return (
                            <td
                              key={sub.id}
                              className="px-2 py-2.5 text-right text-xs tabular-nums text-slate-700"
                            >
                              {score !== null && score !== undefined ? score : "—"}
                            </td>
                          );
                        })}
                        <td className="px-2.5 py-2.5 text-right text-xs font-medium whitespace-nowrap tabular-nums text-slate-900">
                          {r.totalMax > 0 ? `${r.totalObtained}/${r.totalMax}` : "—"}
                        </td>
                        <td className="px-2.5 py-2.5 text-right text-xs font-semibold tabular-nums text-slate-900">
                          {r.percentage !== null ? `${r.percentage}%` : "—"}
                        </td>
                        <td className="px-2.5 py-2.5 text-center text-xs font-bold text-indigo-700">
                          {r.grade ?? "—"}
                        </td>
                        <td className="px-2.5 py-2">
                          <input
                            disabled={!canEditRemarks}
                            value={draft.teacherRemark}
                            onChange={(e) =>
                              updateRemark(r.studentId, "teacherRemark", e.target.value)
                            }
                            placeholder="Teacher comment..."
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                          />
                        </td>
                        {showPrincipalCol && (
                          <td className="px-2.5 py-2">
                            {isAdmin ? (
                              <input
                                value={draft.principalRemark}
                                onChange={(e) =>
                                  updateRemark(r.studentId, "principalRemark", e.target.value)
                                }
                                placeholder="Principal note..."
                                className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                              />
                            ) : (
                              <span className="text-xs italic text-slate-500">
                                {r.principalRemark || "—"}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="no-print px-2.5 py-2.5 text-right whitespace-nowrap">
                          <Link
                            href={`/print/report-card/${r.studentId}/${selectedExam.id}`}
                            className="text-xs font-medium text-indigo-600 hover:underline"
                          >
                            Report Card
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

