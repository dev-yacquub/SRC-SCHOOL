"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { formatShiftLabel } from "@/lib/domain";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";

type ShiftValue = "SHIFT_A" | "SHIFT_B";

type ClassOption = {
  id: string;
  name: string;
  level: number;
};

type StudentOption = {
  id: string;
  admissionNo: string;
  fullName: string;
  classId: string;
  className: string;
};

type DateLateRecord = {
  id: string;
  studentId: string;
  admissionNo: string;
  fullName: string;
  classId: string;
  className: string;
  date: string;
  shift: ShiftValue;
  note: string | null;
  punishedAt: string | null;
};

type StudentLateSummary = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  classId: string;
  className: string;
  totalLateDays: number;
  totalLateShifts: number;
  unpunishedLateDays: number;
  unpunishedLateShifts: number;
  needsPunishmentHighlight: boolean;
  recentRecords: {
    id: string;
    date: string;
    shift: ShiftValue;
    note: string | null;
    punishedAt: string | null;
  }[];
};

export default function AdmissionLateStudentsPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState<ShiftValue>("SHIFT_A");

  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [note, setNote] = useState("");

  const [summarySearch, setSummarySearch] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const [dateRecords, setDateRecords] = useState<DateLateRecord[]>([]);
  const [summaries, setSummaries] = useState<StudentLateSummary[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [punishingId, setPunishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function loadLateData(
    targetClassId = classId,
    targetDate = date,
    targetShift = shift
  ) {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        date: targetDate,
        shift: targetShift,
      });
      if (targetClassId) qs.set("classId", targetClassId);
      const res = await fetch(`/api/admission/late?${qs.toString()}`);
      const contentType = res.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json")
        ? await res.json()
        : { error: `Server error (${res.status}). If you just updated the database schema, restart the dev server.` };
      if (!res.ok) {
        setMessage({
          type: "err",
          text: data.error ?? "Failed to load late arrival records",
        });
        setLoading(false);
        return;
      }

      setClasses(data.classes ?? []);
      const loadedStudents: StudentOption[] = data.students ?? [];
      setStudents(loadedStudents);
      setDateRecords(data.dateRecords ?? []);
      setSummaries(data.studentSummaries ?? []);

      if (
        loadedStudents.length > 0 &&
        !loadedStudents.some((s) => s.id === selectedStudentId)
      ) {
        setSelectedStudentId(loadedStudents[0].id);
      } else if (loadedStudents.length === 0) {
        setSelectedStudentId("");
      }
    } catch {
      setMessage({
        type: "err",
        text: "Network error loading late arrival records",
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadLateData("", date, shift);
  }, []);

  const filteredPickerStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.admissionNo.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  useEffect(() => {
    if (
      filteredPickerStudents.length > 0 &&
      !filteredPickerStudents.some((s) => s.id === selectedStudentId)
    ) {
      setSelectedStudentId(filteredPickerStudents[0].id);
    }
  }, [filteredPickerStudents, selectedStudentId]);

  const filteredSummaries = useMemo(() => {
    const q = summarySearch.trim().toLowerCase();
    return summaries.filter((row) => {
      if (flaggedOnly && !row.needsPunishmentHighlight) return false;
      if (!q) return true;
      return (
        row.fullName.toLowerCase().includes(q) ||
        row.admissionNo.toLowerCase().includes(q) ||
        row.className.toLowerCase().includes(q)
      );
    });
  }, [summaries, summarySearch, flaggedOnly]);

  const flaggedCount = useMemo(
    () => summaries.filter((s) => s.needsPunishmentHighlight).length,
    [summaries]
  );

  async function handleRecordLate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudentId) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admission/late", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record",
          studentId: selectedStudentId,
          date,
          shift,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "err",
          text: data.error ?? "Failed to record late arrival",
        });
        setSaving(false);
        return;
      }
      const stu = students.find((s) => s.id === selectedStudentId);
      setNote("");
      setMessage({
        type: "ok",
        text: `Marked ${stu?.fullName ?? "student"} late on ${date} (${formatShiftLabel(shift)}).`,
      });
      await loadLateData(classId, date, shift);
    } catch {
      setMessage({ type: "err", text: "Network error recording late arrival" });
    }
    setSaving(false);
  }

  async function handlePunishStudent(studentId: string, fullName: string) {
    setPunishingId(studentId);
    setMessage(null);
    try {
      const res = await fetch("/api/admission/late", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "punish", studentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "err",
          text: data.error ?? "Failed to mark student as punished",
        });
        setPunishingId(null);
        return;
      }
      setMessage({
        type: "ok",
        text: `Marked ${fullName} as punished. Red highlight removed.`,
      });
      await loadLateData(classId, date, shift);
    } catch {
      setMessage({
        type: "err",
        text: "Network error updating punishment status",
      });
    }
    setPunishingId(null);
  }

  async function handleDeleteRecord(id: string) {
    setDeletingId(id);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admission/late?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "err",
          text: data.error ?? "Failed to delete late record",
        });
        setDeletingId(null);
        return;
      }
      setMessage({ type: "ok", text: "Late arrival entry removed." });
      await loadLateData(classId, date, shift);
    } catch {
      setMessage({ type: "err", text: "Network error removing entry" });
    }
    setDeletingId(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Late Students"
        subtitle="Record late arrivals for Shift A or Shift B. Students with 3+ late days are highlighted red until punished."
      />

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {flaggedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>
              <strong>{flaggedCount}</strong>{" "}
              {flaggedCount === 1 ? "student has" : "students have"} been late 3
              or more days and {flaggedCount === 1 ? "needs" : "need"}{" "}
              punishment.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFlaggedOnly((prev) => !prev)}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            {flaggedOnly ? "Show All Late Students" : "Show Flagged Only"}
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Record Late Student Form */}
        <Card title="Add Late Student" className="lg:col-span-2">
          <form onSubmit={handleRecordLate} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setDate(nextDate);
                    void loadLateData(classId, nextDate, shift);
                  }}
                  required
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Shift
                </label>
                <div className="grid grid-cols-2 rounded-lg border border-slate-300 bg-slate-50 p-0.5">
                  {(["SHIFT_A", "SHIFT_B"] as const).map((sh) => {
                    const active = shift === sh;
                    return (
                      <button
                        key={sh}
                        type="button"
                        onClick={() => {
                          setShift(sh);
                          void loadLateData(classId, date, sh);
                        }}
                        className={`min-h-[36px] rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "bg-indigo-600 text-white shadow-2xs"
                            : "text-slate-700 hover:bg-white"
                        }`}
                      >
                        {formatShiftLabel(sh)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Filter by Class
              </label>
              <select
                value={classId}
                onChange={(e) => {
                  const nextClass = e.target.value;
                  setClassId(nextClass);
                  void loadLateData(nextClass, date, shift);
                }}
                className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Search Student
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-3 left-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Name or Admission No..."
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 py-2 pr-3 pl-8 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Select Student
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                required
                className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {filteredPickerStudents.length === 0 ? (
                  <option value="">No matching active students</option>
                ) : (
                  filteredPickerStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.admissionNo}) — {s.className}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Note (Optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Arrived 15 mins late"
                maxLength={250}
                className="min-h-[40px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={saving || !selectedStudentId}
              className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              {saving
                ? "Saving..."
                : `Mark Late (${formatShiftLabel(shift)})`}
            </button>
          </form>
        </Card>

        {/* Selected Date & Shift Log */}
        <Card
          title={`Late on ${date} — ${formatShiftLabel(shift)}`}
          className="lg:col-span-3"
        >
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Loading late arrivals...
            </p>
          ) : dateRecords.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
              <Clock className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              No students marked late on {date} ({formatShiftLabel(shift)}).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2 pr-3">Adm No</th>
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3">Note</th>
                    <th className="py-2 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dateRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 pr-3 font-mono text-xs text-slate-600">
                        {rec.admissionNo}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">
                        {rec.fullName}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">
                        {rec.className}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-slate-500">
                        {rec.note || "—"}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(rec.id)}
                          disabled={deletingId === rec.id}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          title="Remove late arrival entry"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Student Late Tracker & Punishment Highlight Table */}
      <Card
        title="Late Student Tracker (3+ Days Highlighted Red)"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={summarySearch}
                onChange={(e) => setSummarySearch(e.target.value)}
                placeholder="Filter student..."
                className="min-h-[36px] rounded-lg border border-slate-300 py-1.5 pr-3 pl-8 text-xs sm:text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => setFlaggedOnly((prev) => !prev)}
              className={`min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                flaggedOnly
                  ? "border-rose-600 bg-rose-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Flagged Only ({flaggedCount})
            </button>
          </div>
        }
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Loading student late summary...
          </p>
        ) : filteredSummaries.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {flaggedOnly
              ? "No students currently have 3 or more unpunished late days."
              : "No late arrival records found yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2.5 pr-4">Student</th>
                  <th className="py-2.5 pr-4">Class</th>
                  <th className="py-2.5 pr-4">Unpunished Late Days</th>
                  <th className="py-2.5 pr-4">Total Late</th>
                  <th className="py-2.5 pr-4">Recent Late Dates</th>
                  <th className="py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSummaries.map((row) => {
                  const isRed = row.needsPunishmentHighlight;
                  return (
                    <tr
                      key={row.studentId}
                      className={
                        isRed
                          ? "border-l-4 border-l-rose-600 bg-rose-50 hover:bg-rose-100/80"
                          : "hover:bg-slate-50/70"
                      }
                    >
                      <td className="py-3 pr-4">
                        <div
                          className={`font-semibold ${
                            isRed ? "text-rose-950" : "text-slate-900"
                          }`}
                        >
                          {row.fullName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {row.admissionNo}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {row.className}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                            isRed
                              ? "bg-rose-600 text-white"
                              : row.unpunishedLateDays > 0
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {row.unpunishedLateDays}{" "}
                          {row.unpunishedLateDays === 1 ? "day" : "days"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-600 tabular-nums">
                        {row.totalLateDays}{" "}
                        {row.totalLateDays === 1 ? "day" : "days"} (
                        {row.totalLateShifts}{" "}
                        {row.totalLateShifts === 1 ? "shift" : "shifts"})
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {row.recentRecords.map((rec) => (
                            <span
                              key={rec.id}
                              className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                                rec.punishedAt
                                  ? "bg-slate-100 text-slate-500 line-through"
                                  : isRed
                                    ? "bg-rose-100 font-semibold text-rose-800"
                                    : "bg-amber-50 text-amber-800"
                              }`}
                              title={
                                rec.punishedAt
                                  ? `Punished (${formatShiftLabel(rec.shift)})`
                                  : `${formatShiftLabel(rec.shift)}${rec.note ? ` — ${rec.note}` : ""}`
                              }
                            >
                              {rec.date} ({rec.shift === "SHIFT_B" ? "B" : "A"})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        {isRed ? (
                          <button
                            type="button"
                            onClick={() =>
                              handlePunishStudent(row.studentId, row.fullName)
                            }
                            disabled={punishingId === row.studentId}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-rose-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {punishingId === row.studentId
                              ? "Saving..."
                              : "Punished"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {row.unpunishedLateDays === 0 ? "Cleared" : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

