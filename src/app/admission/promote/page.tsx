"use client";

import React, { useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { Search } from "lucide-react";

type ClassOption = {
  id: string;
  name: string;
  academicYear: { name: string };
  _count?: { students: number };
};

type StudentItem = {
  id: string;
  admissionNo: string;
  fullName: string;
  gender: "MALE" | "FEMALE";
  attendanceRate: number | null;
  attendanceTotal: number;
  examAvgPercent: number | null;
};

export default function PromoteStudentsPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [fromClassId, setFromClassId] = useState("");
  const [toClassId, setToClassId] = useState("");
  const [markGraduated, setMarkGraduated] = useState(false);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [latestExamName, setLatestExamName] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/academics")
      .then((r) => r.json())
      .then((d) => {
        const list: ClassOption[] = d.classes ?? [];
        setClasses(list);
        if (list.length >= 1) setFromClassId(list[0].id);
        if (list.length >= 2) setToClassId(list[1].id);
      });
  }, []);

  async function loadClassStudents(cid: string) {
    if (!cid) return;
    setLoading(true);
    const res = await fetch(`/api/admission/promote?classId=${cid}`);
    if (res.ok) {
      const data = await res.json();
      const rows: StudentItem[] = data.students ?? [];
      setStudents(rows);
      setLatestExamName(data.latestExamName ?? null);
      setSelected(new Set(rows.map((s) => s.id)));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadClassStudents(fromClassId);
  }, [fromClassId]);

  const filteredStudents = students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.fullName.toLowerCase().includes(q) ||
      s.admissionNo.toLowerCase().includes(q)
    );
  });

  async function handlePromote() {
    setMsg(null);
    if (!markGraduated && fromClassId === toClassId) {
      setMsg({
        type: "err",
        text: "Destination class must be different from the current class.",
      });
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/admission/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentIds: Array.from(selected),
        targetClassId: toClassId,
        markGraduated,
        note,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Promotion failed" });
      return;
    }
    setMsg({
      type: "ok",
      text: `Successfully updated ${data.updatedCount} student(s) and recorded enrollment history.`,
    });
    setNote("");
    loadClassStudents(fromClassId);
  }

  const sameClassBlocked = !markGraduated && fromClassId && fromClassId === toClassId;

  return (
    <div>
      <PageHeader
        title="Bulk Student Promotion"
        subtitle="Review attendance & exam averages before promoting or graduating students"
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

      <Card className="mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              From Class
            </label>
            <select
              value={fromClassId}
              onChange={(e) => setFromClassId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.academicYear.name})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Promote To
            </label>
            <select
              disabled={markGraduated}
              value={toClassId}
              onChange={(e) => setToClassId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.academicYear.name})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Promotion / Graduation Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. End of year promotion"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={markGraduated}
                onChange={(e) => setMarkGraduated(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Mark as Graduated instead
            </label>
            <button
              type="button"
              disabled={submitting || selected.size === 0 || Boolean(sameClassBlocked)}
              onClick={handlePromote}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting
                ? "Updating..."
                : markGraduated
                  ? `Graduate ${selected.size} Student(s)`
                  : `Promote ${selected.size} Student(s)`}
            </button>
          </div>
        </div>
        {sameClassBlocked && (
          <p className="mt-2 text-xs text-rose-600">
            Select a different destination class or check &quot;Mark as Graduated&quot;.
          </p>
        )}
      </Card>

      <Card
        title={`Active Students (${students.length})`}
        subtitle={
          latestExamName
            ? `Showing attendance % and latest exam average (${latestExamName})`
            : "Showing attendance % per student"
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter list..."
                className="rounded-lg border border-slate-200 py-1.5 pr-2.5 pl-8 text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => setSelected(new Set(filteredStudents.map((s) => s.id)))}
              className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        }
      >
        {loading ? (
          <p className="text-sm text-slate-500">Loading class roster...</p>
        ) : filteredStudents.length === 0 ? (
          <p className="text-sm text-slate-500">No active students in this class.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-3">Select</th>
                  <th className="py-2 pr-3">Adm No.</th>
                  <th className="py-2 pr-3">Student Name</th>
                  <th className="py-2 pr-3">Gender</th>
                  <th className="py-2 pr-3 text-right">Attendance</th>
                  <th className="py-2 text-right">Latest Exam Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          setSelected(next);
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">
                      {s.admissionNo}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">
                      {s.fullName}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-slate-600">{s.gender}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {s.attendanceRate !== null ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.attendanceRate < 80
                              ? "bg-rose-50 text-rose-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {s.attendanceRate}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">
                      {s.examAvgPercent !== null ? `${s.examAvgPercent}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
