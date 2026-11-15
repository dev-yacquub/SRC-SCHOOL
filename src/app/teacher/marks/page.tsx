"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { calculateLetterGrade } from "@/lib/domain";
import { Card, PageHeader } from "@/components/ui";
import {
  AlertCircle,
  Download,
  Eraser,
  FileSpreadsheet,
  Lock,
  Printer,
  Search,
  Upload,
} from "lucide-react";

type ExamOption = {
  id: string;
  name: string;
  maxMarks: number;
  isLocked: boolean;
  isPublished: boolean;
  term: { name: string };
};

type AssignmentOption = {
  id: string;
  classId: string;
  subjectId: string;
  class: { id: string; name: string; level: number };
  subject: { id: string; name: string; code: string };
};

type GradeScaleItem = {
  minScore: number;
  maxScore: number;
  grade: string;
  remark: string;
};

type StudentRow = {
  id: string;
  admissionNo: string;
  fullName: string;
};

type ScoreInputMap = Record<string, { score: string; remark: string }>;

export default function TeacherMarksPage() {
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [gradeScales, setGradeScales] = useState<GradeScaleItem[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamOption | null>(null);
  const [selectedAssignment, setSelectedAssignment] =
    useState<AssignmentOption | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [scores, setScores] = useState<ScoreInputMap>({});
  const [initialScores, setInitialScores] = useState<ScoreInputMap>({});
  const [savedStudentIds, setSavedStudentIds] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err" | "warn";
    text: string;
    details?: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadMarks(
    targetExamId: string,
    targetClassId: string,
    targetSubjectId: string,
    keepMessage = false
  ) {
    setLoading(true);
    if (!keepMessage) setMessage(null);
    try {
      const qs = new URLSearchParams();
      if (targetExamId) qs.set("examId", targetExamId);
      if (targetClassId) qs.set("classId", targetClassId);
      if (targetSubjectId) qs.set("subjectId", targetSubjectId);

      const res = await fetch(`/api/teacher/marks?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data.error ?? "Failed to load marks" });
        setLoading(false);
        return;
      }

      setExams(data.exams ?? []);
      setAssignments(data.assignments ?? []);
      setGradeScales(data.gradeScales ?? []);
      setSelectedExam(data.selectedExam ?? null);
      setSelectedAssignment(data.selectedAssignment ?? null);
      setStudents(data.students ?? []);
      setIsAdmin(Boolean(data.isAdmin));

      const map: ScoreInputMap = {};
      const snapshot: ScoreInputMap = {};
      const existingIds = new Set<string>();

      for (const s of (data.students ?? []) as StudentRow[]) {
        const mark = (data.marks ?? []).find(
          (m: { studentId: string; score: number; remark: string | null }) =>
            m.studentId === s.id
        );
        const entry = {
          score: mark ? String(mark.score) : "",
          remark: mark?.remark ?? "",
        };
        map[s.id] = { ...entry };
        snapshot[s.id] = { ...entry };
        if (mark) existingIds.add(s.id);
      }

      setScores(map);
      setInitialScores(snapshot);
      setSavedStudentIds(existingIds);
    } catch {
      setMessage({ type: "err", text: "Network error loading gradebook" });
    }
    setLoading(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    void loadMarks(
      params.get("examId") ?? "",
      params.get("classId") ?? "",
      params.get("subjectId") ?? ""
    );
  }, []);

  const examId = selectedExam?.id ?? "";
  const classId = selectedAssignment?.classId ?? "";
  const subjectId = selectedAssignment?.subjectId ?? "";
  const canEdit = Boolean(
    selectedExam && selectedAssignment && (!selectedExam.isLocked || isAdmin)
  );

  const hasUnsavedChanges = students.some((s) => {
    const cur = scores[s.id] ?? { score: "", remark: "" };
    const init = initialScores[s.id] ?? { score: "", remark: "" };
    return cur.score !== init.score || cur.remark !== init.remark;
  });

  function updateField(studentId: string, field: "score" | "remark", value: string) {
    setScores((prev) => ({
      ...prev,
      [studentId]: {
        score: prev[studentId]?.score ?? "",
        remark: prev[studentId]?.remark ?? "",
        [field]: value,
      },
    }));
  }

  function clearRow(studentId: string) {
    setScores((prev) => ({
      ...prev,
      [studentId]: { score: "", remark: "" },
    }));
  }

  async function saveMarks() {
    if (!selectedExam || !selectedAssignment || !canEdit) return;
    setMessage(null);

    const entries: { studentId: string; score: number; remark: string }[] = [];
    const clearStudentIds: string[] = [];

    for (const s of students) {
      const row = scores[s.id] ?? { score: "", remark: "" };
      const trimmedScore = row.score.trim();

      if (trimmedScore === "") {
        if (savedStudentIds.has(s.id)) {
          clearStudentIds.push(s.id);
        }
        continue;
      }

      const numeric = Number(trimmedScore);
      if (Number.isNaN(numeric) || numeric < 0 || numeric > selectedExam.maxMarks) {
        setMessage({
          type: "err",
          text: `${s.fullName} (${s.admissionNo}): score must be between 0 and ${selectedExam.maxMarks}.`,
        });
        return;
      }

      entries.push({
        studentId: s.id,
        score: numeric,
        remark: row.remark.trim(),
      });
    }

    if (entries.length === 0 && clearStudentIds.length === 0) {
      setMessage({
        type: "err",
        text: "Enter at least one score or clear an existing mark before saving.",
      });
      return;
    }

    setSaving(true);
    const res = await fetch("/api/teacher/marks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examId: selectedExam.id,
        classId: selectedAssignment.classId,
        subjectId: selectedAssignment.subjectId,
        entries,
        clearStudentIds,
      }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "Failed to save marks" });
      return;
    }

    const parts: string[] = [];
    if (data.saved > 0) parts.push(`saved ${data.saved} score${data.saved === 1 ? "" : "s"}`);
    if (data.cleared > 0)
      parts.push(`cleared ${data.cleared} mark${data.cleared === 1 ? "" : "s"}`);

    setMessage({
      type: "ok",
      text: `Successfully ${parts.join(" and ")} for ${selectedAssignment.subject.name}.`,
    });
    await loadMarks(selectedExam.id, selectedAssignment.classId, selectedAssignment.subjectId, true);
  }

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedExam || !selectedAssignment) return;

    setImporting(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("examId", selectedExam.id);
      formData.append("classId", selectedAssignment.classId);
      formData.append("subjectId", selectedAssignment.subjectId);
      formData.append("file", file);

      const res = await fetch("/api/teacher/marks/excel", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "err",
          text: data.error ?? "Failed to import marks spreadsheet",
          details: data.errors,
        });
        setImporting(false);
        return;
      }

      const warnings = (data.errors ?? []) as string[];
      setMessage({
        type: warnings.length > 0 ? "warn" : "ok",
        text: `Imported ${data.saved} student marks from Excel.${
          warnings.length > 0 ? ` (${warnings.length} rows skipped)` : ""
        }`,
        details: warnings.slice(0, 5),
      });
      await loadMarks(selectedExam.id, selectedAssignment.classId, selectedAssignment.subjectId, true);
    } catch {
      setMessage({ type: "err", text: "Network error importing Excel sheet" });
    }
    setImporting(false);
  }

  // Live stats calculation across all students in this subject
  const maxMarks = selectedExam?.maxMarks ?? 100;
  const gradedScores: { score: number; grade: string; pct: number }[] = [];
  const gradeCounts = new Map<string, number>();

  for (const s of students) {
    const raw = scores[s.id]?.score?.trim() ?? "";
    if (!raw) continue;
    const num = Number(raw);
    if (Number.isNaN(num) || num < 0 || num > maxMarks) continue;
    const g = calculateLetterGrade(num, maxMarks, gradeScales);
    gradedScores.push({ score: num, grade: g.grade, pct: g.percentage });
    gradeCounts.set(g.grade, (gradeCounts.get(g.grade) ?? 0) + 1);
  }

  const gradedCount = gradedScores.length;
  const avgScore =
    gradedCount > 0
      ? Math.round((gradedScores.reduce((acc, x) => acc + x.score, 0) / gradedCount) * 10) / 10
      : null;
  const avgPct =
    gradedCount > 0
      ? Math.round(gradedScores.reduce((acc, x) => acc + x.pct, 0) / gradedCount)
      : null;
  const highestScore =
    gradedCount > 0 ? Math.max(...gradedScores.map((x) => x.score)) : null;
  const lowestScore =
    gradedCount > 0 ? Math.min(...gradedScores.map((x) => x.score)) : null;
  const passCount = gradedScores.filter(
    (x) => x.grade.toUpperCase() !== "F" && x.pct >= 50
  ).length;
  const passRate =
    gradedCount > 0 ? Math.round((passCount / gradedCount) * 100) : null;

  const normalizedSearch = search.trim().toLowerCase();
  const visibleStudents = normalizedSearch
    ? students.filter(
        (s) =>
          s.fullName.toLowerCase().includes(normalizedSearch) ||
          s.admissionNo.toLowerCase().includes(normalizedSearch)
      )
    : students;

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Exam Marks Entry"
          subtitle="Record, import, and review subject grades per class and exam"
          action={
            <>
              {classId && examId && (
                <Link
                  href={`/teacher/results?classId=${classId}&examId=${examId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Class Broadsheet
                </Link>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Printer className="h-4 w-4" />
                Print Mark Sheet
              </button>
            </>
          }
        />
      </div>

      {message && (
        <div
          className={`no-print mb-4 rounded-lg border px-4 py-3 text-sm ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : message.type === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          <p className="font-medium">{message.text}</p>
          {message.details && message.details.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {message.details.map((d, idx) => (
                <li key={idx}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Card>
        <div className="no-print mb-4 flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Examination
              </label>
              <select
                value={examId}
                onChange={(e) => loadMarks(e.target.value, classId, subjectId)}
                className="min-h-[42px] w-full max-w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
              >
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} ({ex.term.name}) — Max {ex.maxMarks}
                    {ex.isLocked ? " [Locked]" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Class &amp; Subject
              </label>
              <select
                value={selectedAssignment ? `${classId}:${subjectId}` : ""}
                onChange={(e) => {
                  const [cId, sId] = e.target.value.split(":");
                  if (cId && sId) void loadMarks(examId, cId, sId);
                }}
                className="min-h-[42px] w-full max-w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
              >
                {assignments.map((a) => (
                  <option
                    key={`${a.classId}:${a.subjectId}`}
                    value={`${a.classId}:${a.subjectId}`}
                  >
                    {a.class.name} · {a.subject.name} ({a.subject.code})
                  </option>
                ))}
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
            {hasUnsavedChanges && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                <AlertCircle className="h-3.5 w-3.5" />
                Unsaved changes
              </span>
            )}
            {selectedExam?.isLocked && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  isAdmin
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                <Lock className="h-3 w-3" />
                {isAdmin ? "Locked (Admin Override)" : "Locked by Admin"}
              </span>
            )}
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              {selectedExam && selectedAssignment && (
                <a
                  href={`/api/teacher/marks/excel?examId=${encodeURIComponent(
                    selectedExam.id
                  )}&classId=${encodeURIComponent(
                    selectedAssignment.classId
                  )}&subjectId=${encodeURIComponent(selectedAssignment.subjectId)}`}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export Excel
                </a>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleExcelUpload}
                className="hidden"
              />
              <button
                type="button"
                disabled={!canEdit || importing || students.length === 0}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {importing ? "Importing..." : "Import Excel"}
              </button>
            </div>
            <button
              type="button"
              onClick={saveMarks}
              disabled={!canEdit || saving || students.length === 0}
              className="hidden min-h-[40px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 md:inline-flex md:items-center"
            >
              {saving ? "Saving..." : "Save Marks"}
            </button>
          </div>
        </div>

        {/* Print Header */}
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-900">
            {selectedAssignment
              ? `${selectedAssignment.class.name} — ${selectedAssignment.subject.name} (${selectedAssignment.subject.code})`
              : "Subject Mark Sheet"}
          </h2>
          {selectedExam && (
            <p className="text-xs text-slate-500">
              {selectedExam.name} ({selectedExam.term.name}) · Maximum Score:{" "}
              {selectedExam.maxMarks}
            </p>
          )}
        </div>

        {/* Live Class Stats Strip */}
        {!loading && students.length > 0 && (
          <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase">Graded</p>
                <p className="text-base font-bold text-slate-900 tabular-nums">
                  {gradedCount} / {students.length}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase">
                  Class Average
                </p>
                <p className="text-base font-bold text-indigo-700 tabular-nums">
                  {avgScore !== null ? `${avgScore} (${avgPct}%)` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase">Highest</p>
                <p className="text-base font-bold text-emerald-700 tabular-nums">
                  {highestScore !== null ? highestScore : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase">Lowest</p>
                <p className="text-base font-bold text-rose-700 tabular-nums">
                  {lowestScore !== null ? lowestScore : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase">
                  Pass Rate (≥50%)
                </p>
                <p className="text-base font-bold text-slate-900 tabular-nums">
                  {passRate !== null ? `${passRate}%` : "—"}
                </p>
              </div>
            </div>
            {gradeCounts.size > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-2 text-xs text-slate-600">
                <span className="font-medium text-slate-500">Grades:</span>
                {Array.from(gradeCounts.entries())
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([grade, count]) => (
                    <span
                      key={grade}
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 tabular-nums"
                    >
                      {grade}: {count}
                    </span>
                  ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Loading mark sheet...
          </p>
        ) : !selectedExam || !selectedAssignment ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {exams.length === 0
              ? "No exams configured yet by Admin."
              : "No subject assignments found."}
          </p>
        ) : students.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No active students in {selectedAssignment.class.name}.
          </p>
        ) : (
          <>
            {/* Mobile Marks Entry Cards */}
            <div className="space-y-3 md:hidden">
              {visibleStudents.map((s, idx) => {
                const row = scores[s.id] ?? { score: "", remark: "" };
                const trimmed = row.score.trim();
                const num = trimmed === "" ? null : Number(trimmed);
                const isValid =
                  num !== null && !Number.isNaN(num) && num >= 0 && num <= maxMarks;
                const computed =
                  isValid && num !== null
                    ? calculateLetterGrade(num, maxMarks, gradeScales)
                    : null;
                const invalidInput = trimmed !== "" && !isValid;

                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
                  >
                    <div className="mb-2.5 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">
                          <span className="mr-1.5 text-xs font-normal text-slate-400 tabular-nums">
                            #{idx + 1}
                          </span>
                          {s.fullName}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {s.admissionNo}
                        </p>
                      </div>
                      {computed ? (
                        <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 tabular-nums">
                          {computed.percentage}% · {computed.grade}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-slate-400">—</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <label className="mb-1 block text-[11px] font-medium text-slate-500">
                          Score (0 – {maxMarks})
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={maxMarks}
                          step="0.5"
                          disabled={!canEdit}
                          value={row.score}
                          onChange={(e) => updateField(s.id, "score", e.target.value)}
                          placeholder="—"
                          className={`min-h-[44px] w-full rounded-lg border px-3 py-2 text-base tabular-nums focus:outline-none disabled:bg-slate-50 ${
                            invalidInput
                              ? "border-rose-500 bg-rose-50 text-rose-700"
                              : "border-slate-300 focus:border-indigo-500"
                          }`}
                        />
                      </div>
                      {canEdit && (
                        <div className="pt-5">
                          <button
                            type="button"
                            onClick={() => clearRow(s.id)}
                            disabled={row.score === "" && row.remark === ""}
                            aria-label="Clear mark"
                            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"
                          >
                            <Eraser className="h-3.5 w-3.5" />
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    <input
                      disabled={!canEdit}
                      value={row.remark}
                      onChange={(e) => updateField(s.id, "remark", e.target.value)}
                      placeholder="Optional subject remark..."
                      className="mt-2.5 min-h-[38px] w-full rounded-lg border border-slate-200 px-3 py-1.5 text-base focus:border-indigo-500 focus:outline-none disabled:bg-slate-50 sm:text-xs"
                    />
                  </div>
                );
              })}

              {visibleStudents.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-500">
                  No students match &ldquo;{search}&rdquo;.
                </p>
              )}

              {canEdit && students.length > 0 && (
                <div className="sticky bottom-[66px] z-20 -mx-1 rounded-xl border border-indigo-200 bg-white/95 p-3 shadow-md backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={saveMarks}
                    disabled={saving}
                    className="min-h-[44px] w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving
                      ? "Saving Marks..."
                      : hasUnsavedChanges
                        ? `Save Unsaved Marks (${gradedCount}/${students.length})`
                        : `Save Marks (${gradedCount}/${students.length} Graded)`}
                  </button>
                </div>
              )}
            </div>

            {/* Desktop Gradebook Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2.5 pr-4">#</th>
                    <th className="py-2.5 pr-4">Adm No</th>
                    <th className="py-2.5 pr-4">Student Name</th>
                    <th className="py-2.5 pr-4">Score (/ {maxMarks})</th>
                    <th className="py-2.5 pr-4">%</th>
                    <th className="py-2.5 pr-4">Grade</th>
                    <th className="py-2.5 pr-4">Subject Remark</th>
                    {canEdit && <th className="no-print py-2.5 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleStudents.map((s, idx) => {
                    const row = scores[s.id] ?? { score: "", remark: "" };
                    const trimmed = row.score.trim();
                    const num = trimmed === "" ? null : Number(trimmed);
                    const isValid =
                      num !== null && !Number.isNaN(num) && num >= 0 && num <= maxMarks;
                    const computed =
                      isValid && num !== null
                        ? calculateLetterGrade(num, maxMarks, gradeScales)
                        : null;
                    const invalidInput = trimmed !== "" && !isValid;

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 pr-4 text-xs text-slate-400 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">
                          {s.admissionNo}
                        </td>
                        <td className="py-2.5 pr-4 font-medium text-slate-900">
                          {s.fullName}
                        </td>
                        <td className="py-2.5 pr-4">
                          <input
                            type="number"
                            min={0}
                            max={maxMarks}
                            step="0.5"
                            disabled={!canEdit}
                            value={row.score}
                            onChange={(e) => updateField(s.id, "score", e.target.value)}
                            placeholder="—"
                            className={`w-24 rounded-md border px-2.5 py-1 text-sm tabular-nums focus:outline-none disabled:bg-slate-50 ${
                              invalidInput
                                ? "border-rose-500 bg-rose-50 text-rose-700"
                                : "border-slate-300 focus:border-indigo-500"
                            }`}
                          />
                        </td>
                        <td className="py-2.5 pr-4 text-slate-600 tabular-nums">
                          {computed ? `${computed.percentage}%` : "—"}
                        </td>
                        <td className="py-2.5 pr-4 font-bold text-indigo-700">
                          {computed ? computed.grade : "—"}
                        </td>
                        <td className="py-2.5 pr-4">
                          <input
                            disabled={!canEdit}
                            value={row.remark}
                            onChange={(e) => updateField(s.id, "remark", e.target.value)}
                            placeholder="Optional subject note..."
                            className="w-full max-w-xs rounded-md border border-slate-200 px-2.5 py-1 text-xs focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
                          />
                        </td>
                        {canEdit && (
                          <td className="no-print py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => clearRow(s.id)}
                              disabled={row.score === "" && row.remark === ""}
                              title="Clear mark"
                              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"
                            >
                              <Eraser className="h-3 w-3" />
                              Clear
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {visibleStudents.length === 0 && (
                    <tr>
                      <td
                        colSpan={canEdit ? 8 : 7}
                        className="py-6 text-center text-sm text-slate-500"
                      >
                        No students match &ldquo;{search}&rdquo;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
