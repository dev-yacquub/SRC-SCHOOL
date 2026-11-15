"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";

type Exam = {
  id: string;
  termId?: string;
  name: string;
  maxMarks: number;
  isLocked: boolean;
  isPublished: boolean;
  term: { id?: string; name: string; academicYear: { name: string } };
  _count: { marks: number };
};

type Term = { id: string; name: string; academicYear: { name: string } };
type GradeScale = {
  minScore: number;
  maxScore: number;
  grade: string;
  remark: string;
};
type CompletionItem = {
  className: string;
  subjectName: string;
  teacherName: string;
  expected: number;
  entered: number;
};

export default function AdminExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [scales, setScales] = useState<GradeScale[]>([]);
  const [completion, setCompletion] = useState<
    { examId: string; items: CompletionItem[] }[]
  >([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [students, setStudents] = useState<
    { id: string; admissionNo: string; fullName: string; class: { name: string } }[]
  >([]);
  const [reportStudentId, setReportStudentId] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [termId, setTermId] = useState("");
  const [examName, setExamName] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");

  async function loadAll() {
    const [res, stuRes] = await Promise.all([
      fetch("/api/admin/exams"),
      fetch("/api/admission/students?status=ACTIVE"),
    ]);
    if (res.ok) {
      const data = await res.json();
      setExams(data.exams ?? []);
      setTerms(data.terms ?? []);
      setScales(data.gradeScales ?? []);
      setCompletion(data.completion ?? []);
      if (data.terms?.length) setTermId((p) => p || data.terms[0].id);
      if (data.exams?.length) setSelectedExamId((p) => p || data.exams[0].id);
    }
    if (stuRes.ok) {
      const stuData = await stuRes.json();
      const list = stuData.students ?? [];
      setStudents(list);
      if (list.length) setReportStudentId((p) => p || list[0].id);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function postAction(action: string, data: unknown) {
    setMsg(null);
    const res = await fetch("/api/admin/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data }),
    });
    const out = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: out.error ?? "Failed" });
      return false;
    }
    setMsg({ type: "ok", text: "Updated successfully." });
    await loadAll();
    return true;
  }

  async function deleteExam(ex: Exam) {
    if (
      !window.confirm(
        `Delete exam "${ex.name}" and all ${ex._count.marks} recorded marks for it?`
      )
    ) {
      return;
    }
    setMsg(null);
    const res = await fetch(`/api/admin/exams?id=${ex.id}`, {
      method: "DELETE",
    });
    const out = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: out.error ?? "Failed to delete exam" });
      return;
    }
    if (editingExamId === ex.id) {
      setEditingExamId(null);
      setExamName("");
    }
    setMsg({ type: "ok", text: `Deleted exam "${ex.name}".` });
    await loadAll();
  }

  const activeCompletion =
    completion.find((c) => c.examId === selectedExamId)?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Exams, Grading Scale & Results Publishing"
        subtitle="Set up exams, review teacher mark completion, lock marks, and publish report cards"
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

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card title={editingExamId ? "Edit Exam" : "Create Exam"} className="lg:col-span-1">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await postAction(
                editingExamId ? "updateExam" : "createExam",
                {
                  ...(editingExamId ? { id: editingExamId } : {}),
                  termId,
                  name: examName,
                  maxMarks: Number(maxMarks),
                }
              );
              if (ok) {
                setEditingExamId(null);
                setExamName("");
              }
            }}
            className="space-y-3"
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
                    {t.name} ({t.academicYear?.name ?? "—"})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Exam Name
              </label>
              <input
                type="text"
                required
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="e.g. Monthly Quiz 1"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Max Marks
              </label>
              <input
                type="number"
                required
                min={1}
                max={1000}
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                {editingExamId ? "Update Exam" : "Create Exam"}
              </button>
              {editingExamId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingExamId(null);
                    setExamName("");
                    setMaxMarks("100");
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </Card>

        <Card title="Exams & Publish Controls" className="lg:col-span-2">
          <div className="divide-y divide-slate-100">
            {exams.map((ex) => (
              <div
                key={ex.id}
                className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-semibold text-slate-900">{ex.name}</p>
                  <p className="text-xs text-slate-500">
                    {ex.term?.name ?? "—"} · Max {ex.maxMarks} · {ex._count?.marks ?? 0} marks
                    recorded
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {ex.isLocked && <StatusBadge value="LOCKED" />}
                  <StatusBadge value={ex.isPublished ? "PUBLISHED" : "DRAFT"} />
                  <button
                    type="button"
                    onClick={() =>
                      postAction("toggleExamState", {
                        examId: ex.id,
                        isLocked: !ex.isLocked,
                        isPublished: ex.isLocked ? false : ex.isPublished,
                      })
                    }
                    className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {ex.isLocked ? "Unlock" : "Lock"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      postAction("toggleExamState", {
                        examId: ex.id,
                        isPublished: !ex.isPublished,
                      })
                    }
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      ex.isPublished
                        ? "bg-amber-50 text-amber-800 hover:bg-amber-100"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    {ex.isPublished ? "Unpublish" : "Publish Results"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingExamId(ex.id);
                      if (ex.termId || ex.term.id) {
                        setTermId(ex.termId ?? ex.term.id ?? "");
                      }
                      setExamName(ex.name);
                      setMaxMarks(String(ex.maxMarks));
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    title="Edit exam"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteExam(ex)}
                    className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100"
                    title="Delete exam"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Marks Entry Completion"
          action={
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-3">Class</th>
                  <th className="py-2 pr-3">Subject</th>
                  <th className="py-2 pr-3">Teacher</th>
                  <th className="py-2 text-right">Entered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeCompletion.map((row, idx) => (
                  <tr key={idx}>
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      {row.className}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">{row.subjectName}</td>
                    <td className="py-2 pr-3 text-slate-500">{row.teacherName}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      <span
                        className={
                          row.entered >= row.expected && row.expected > 0
                            ? "text-emerald-700"
                            : "text-amber-700"
                        }
                      >
                        {row.entered} / {row.expected}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Grading Scale (%)">
          <div className="space-y-2">
            {scales.map((s, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <input
                  type="number"
                  step="0.01"
                  value={s.minScore}
                  onChange={(e) => {
                    const next = [...scales];
                    next[idx] = { ...s, minScore: Number(e.target.value) };
                    setScales(next);
                  }}
                  className="w-20 rounded border border-slate-300 px-2 py-1.5 tabular-nums"
                  placeholder="Min"
                />
                <input
                  type="number"
                  step="0.01"
                  value={s.maxScore}
                  onChange={(e) => {
                    const next = [...scales];
                    next[idx] = { ...s, maxScore: Number(e.target.value) };
                    setScales(next);
                  }}
                  className="w-20 rounded border border-slate-300 px-2 py-1.5 tabular-nums"
                  placeholder="Max"
                />
                <input
                  type="text"
                  value={s.grade}
                  onChange={(e) => {
                    const next = [...scales];
                    next[idx] = { ...s, grade: e.target.value };
                    setScales(next);
                  }}
                  className="w-16 rounded border border-slate-300 px-2 py-1.5 font-semibold"
                  placeholder="Grade"
                />
                <input
                  type="text"
                  value={s.remark}
                  onChange={(e) => {
                    const next = [...scales];
                    next[idx] = { ...s, remark: e.target.value };
                    setScales(next);
                  }}
                  className="flex-1 rounded border border-slate-300 px-2 py-1.5"
                  placeholder="Remark"
                />
                <button
                  type="button"
                  disabled={scales.length <= 1}
                  onClick={() =>
                    setScales(scales.filter((_, i) => i !== idx))
                  }
                  className="rounded p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                  title="Remove grade row"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setScales([
                  ...scales,
                  { minScore: 0, maxScore: 49.99, grade: "F", remark: "Fail" },
                ])
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Grade Band
            </button>
            <button
              type="button"
              onClick={() => postAction("updateGradeScale", { scales })}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Save Grading Scale
            </button>
          </div>
        </Card>
      </div>

      <Card
        title="View / Print Student Report Card"
        subtitle="Open any student's report card PDF (including unpublished drafts for review)"
        className="mt-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={reportStudentId}
            onChange={(e) => setReportStudentId(e.target.value)}
            className="min-w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} ({s.class.name} · {s.admissionNo})
              </option>
            ))}
          </select>
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
          {reportStudentId && selectedExamId && (
            <Link
              href={`/print/report-card/${reportStudentId}/${selectedExamId}`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Open Report Card PDF
            </Link>
          )}
          <Link
            href={
              selectedExamId
                ? `/teacher/results?examId=${selectedExamId}`
                : "/teacher/results"
            }
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Class Broadsheet &amp; Bulk Print
          </Link>
        </div>
      </Card>
    </div>
  );
}

