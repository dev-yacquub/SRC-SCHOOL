"use client";

import React, { useEffect, useState } from "react";
import { summarizeAttendance } from "@/lib/domain";
import { Card, PageHeader } from "@/components/ui";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Printer,
  Search,
} from "lucide-react";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";

type ClassOption = { id: string; name: string; level: number };
type DailyStudent = {
  id: string;
  admissionNo: string;
  fullName: string;
  gender: string;
};
type DailyRecord = {
  studentId: string;
  status: AttendanceStatus;
  note: string;
};

type MonthlyRow = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  days: Record<number, { status: AttendanceStatus; note: string | null }>;
  summary: {
    total: number;
    present: number;
    late: number;
    absent: number;
    ratePercent: number;
  };
};

export default function TeacherAttendancePage() {
  const [tab, setTab] = useState<"daily" | "monthly">("daily");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Daily state
  const [students, setStudents] = useState<DailyStudent[]>([]);
  const [records, setRecords] = useState<Record<string, DailyRecord>>({});
  const [alreadyRecorded, setAlreadyRecorded] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  // Monthly state
  const [monthLabel, setMonthLabel] = useState("");
  const [daysInMonth, setDaysInMonth] = useState(30);
  const [monthlyRows, setMonthlyRows] = useState<MonthlyRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function loadDaily(targetClassId: string, targetDate: string) {
    setLoading(true);
    setMessage(null);
    try {
      const qs = new URLSearchParams({ date: targetDate });
      if (targetClassId) qs.set("classId", targetClassId);
      const res = await fetch(`/api/teacher/attendance?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data.error ?? "Failed to load attendance" });
        setLoading(false);
        return;
      }

      setClasses(data.classes ?? []);
      setClassId(data.selectedClassId ?? "");
      setDate(data.date ?? targetDate);
      setStudents(data.students ?? []);
      setAlreadyRecorded(Boolean(data.alreadyRecorded));

      const map: Record<string, DailyRecord> = {};
      for (const s of (data.students ?? []) as DailyStudent[]) {
        const existing = (data.attendance ?? []).find(
          (a: { studentId: string; status: AttendanceStatus; note: string | null }) =>
            a.studentId === s.id
        );
        map[s.id] = {
          studentId: s.id,
          status: existing?.status ?? "PRESENT",
          note: existing?.note ?? "",
        };
      }
      setRecords(map);
    } catch {
      setMessage({ type: "err", text: "Network error loading attendance" });
    }
    setLoading(false);
  }

  async function loadMonthly(targetClassId: string, targetMonth: string) {
    setLoading(true);
    setMessage(null);
    try {
      const qs = new URLSearchParams({ month: targetMonth });
      if (targetClassId) qs.set("classId", targetClassId);
      const res = await fetch(`/api/teacher/attendance/monthly?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "err",
          text: data.error ?? "Failed to load monthly attendance",
        });
        setLoading(false);
        return;
      }

      setClasses(data.classes ?? []);
      setClassId(data.selectedClassId ?? "");
      setMonth(data.month ?? targetMonth);
      setMonthLabel(data.monthLabel ?? targetMonth);
      setDaysInMonth(data.daysInMonth ?? 30);
      setMonthlyRows(data.rows ?? []);
    } catch {
      setMessage({ type: "err", text: "Network error loading monthly register" });
    }
    setLoading(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initClass = params.get("classId") ?? "";
    const initDate = params.get("date") ?? new Date().toISOString().slice(0, 10);
    const initMonth = params.get("month") ?? new Date().toISOString().slice(0, 7);
    const initTab = params.get("tab") === "monthly" ? "monthly" : "daily";

    setTab(initTab);
    if (initTab === "monthly") {
      void loadMonthly(initClass, initMonth);
    } else {
      void loadDaily(initClass, initDate);
    }
  }, []);

  function handleTabChange(nextTab: "daily" | "monthly") {
    if (nextTab === tab) return;
    setTab(nextTab);
    if (nextTab === "monthly") {
      void loadMonthly(classId, month);
    } else {
      void loadDaily(classId, date);
    }
  }

  function handleClassChange(nextClassId: string) {
    setClassId(nextClassId);
    if (tab === "monthly") {
      void loadMonthly(nextClassId, month);
    } else {
      void loadDaily(nextClassId, date);
    }
  }

  function handleDateChange(nextDate: string) {
    setDate(nextDate);
    void loadDaily(classId, nextDate);
  }

  function handleMonthChange(nextMonth: string) {
    setMonth(nextMonth);
    void loadMonthly(classId, nextMonth);
  }

  function setStatus(studentId: string, status: AttendanceStatus) {
    setRecords((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], studentId, status },
    }));
  }

  function setNote(studentId: string, note: string) {
    setRecords((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], studentId, note },
    }));
  }

  function markAll(status: AttendanceStatus) {
    setRecords((prev) => {
      const next = { ...prev };
      for (const s of students) {
        next[s.id] = {
          studentId: s.id,
          status,
          note: next[s.id]?.note ?? "",
        };
      }
      return next;
    });
  }

  async function saveAttendance() {
    if (!classId || students.length === 0) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/teacher/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId,
        date,
        records: students.map((s) => records[s.id] ?? { studentId: s.id, status: "PRESENT", note: "" }),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "Failed to save attendance" });
      return;
    }
    setAlreadyRecorded(true);
    setMessage({
      type: "ok",
      text: `Saved attendance for ${data.saved} students on ${date}.`,
    });
  }

  const recordList = students.map((s) => records[s.id] ?? { studentId: s.id, status: "PRESENT" as AttendanceStatus, note: "" });
  const dailySummary = summarizeAttendance(recordList);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredStudents = normalizedSearch
    ? students.filter(
        (s) =>
          s.fullName.toLowerCase().includes(normalizedSearch) ||
          s.admissionNo.toLowerCase().includes(normalizedSearch)
      )
    : students;

  const selectedClassName =
    classes.find((c) => c.id === classId)?.name ?? "Selected Class";

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Student Attendance"
          subtitle="Daily class roll call and monthly attendance register"
          action={
            <div className="grid w-full grid-cols-2 rounded-lg border border-slate-200 bg-white p-1 sm:inline-flex sm:w-auto">
              <button
                type="button"
                onClick={() => handleTabChange("daily")}
                className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === "daily"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <ClipboardCheck className="h-4 w-4" />
                Daily Roll Call
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("monthly")}
                className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === "monthly"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <CalendarDays className="h-4 w-4" />
                Monthly
              </button>
            </div>
          }
        />
      </div>

      {message && (
        <div
          className={`no-print mb-4 rounded-lg border px-4 py-3 text-sm ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {tab === "daily" ? (
        <Card>
          <div className="mb-4 flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
              <div className="sm:w-auto">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Class
                </label>
                <select
                  value={classId}
                  onChange={(e) => handleClassChange(e.target.value)}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:w-auto">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
                />
              </div>
              <div className="sm:w-auto">
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
              {classes.length > 0 && (
                alreadyRecorded ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Recorded for {date}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                    Pending for {date}
                  </span>
                )
              )}
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                <button
                  type="button"
                  onClick={() => markAll("PRESENT")}
                  disabled={students.length === 0}
                  className="min-h-[40px] rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Mark All Present
                </button>
                <button
                  type="button"
                  onClick={() => markAll("ABSENT")}
                  disabled={students.length === 0}
                  className="min-h-[40px] rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Mark All Absent
                </button>
              </div>
              <button
                type="button"
                onClick={saveAttendance}
                disabled={saving || students.length === 0}
                className="hidden min-h-[40px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 md:inline-flex md:items-center"
              >
                {saving ? "Saving..." : "Save Attendance"}
              </button>
            </div>
          </div>

          {!loading && students.length > 0 && (
            <div className="mb-4 grid grid-cols-3 gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-5">
              <div>
                <p className="text-[11px] font-medium text-slate-500 uppercase">Students</p>
                <p className="text-base font-bold text-slate-900 tabular-nums sm:text-lg">
                  {dailySummary.total}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-emerald-600 uppercase">Present</p>
                <p className="text-base font-bold text-emerald-700 tabular-nums sm:text-lg">
                  {dailySummary.present}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-amber-600 uppercase">Late</p>
                <p className="text-base font-bold text-amber-700 tabular-nums sm:text-lg">
                  {dailySummary.late}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-rose-600 uppercase">Absent</p>
                <p className="text-base font-bold text-rose-700 tabular-nums sm:text-lg">
                  {dailySummary.absent}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[11px] font-medium text-indigo-600 uppercase">
                  Rate (P+L)
                </p>
                <p className="text-base font-bold text-indigo-700 tabular-nums sm:text-lg">
                  {dailySummary.ratePercent}%
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Loading class roster...
            </p>
          ) : classes.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              You have no classes assigned yet.
            </p>
          ) : students.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No active students enrolled in this class.
            </p>
          ) : (
            <>
              {/* Mobile Touch-Friendly Card List */}
              <div className="space-y-3 md:hidden">
                {filteredStudents.map((s, idx) => {
                  const rec = records[s.id] ?? {
                    studentId: s.id,
                    status: "PRESENT" as AttendanceStatus,
                    note: "",
                  };
                  return (
                    <div
                      key={s.id}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
                    >
                      <div className="mb-2.5 flex items-baseline justify-between gap-2">
                        <p className="font-semibold text-slate-900">
                          <span className="mr-1.5 text-xs font-normal text-slate-400 tabular-nums">
                            #{idx + 1}
                          </span>
                          {s.fullName}
                        </p>
                        <span className="shrink-0 font-mono text-[11px] text-slate-500">
                          {s.admissionNo}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {(["PRESENT", "LATE", "ABSENT"] as const).map((st) => {
                          const active = rec.status === st;
                          const activeStyle =
                            st === "PRESENT"
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : st === "LATE"
                                ? "border-amber-500 bg-amber-500 text-white"
                                : "border-rose-600 bg-rose-600 text-white";
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setStatus(s.id, st)}
                              className={`min-h-[44px] rounded-lg border text-xs font-semibold transition ${
                                active
                                  ? activeStyle
                                  : "border-slate-200 bg-slate-50 text-slate-700 active:bg-slate-100"
                              }`}
                            >
                              {st}
                            </button>
                          );
                        })}
                      </div>

                      <input
                        value={rec.note}
                        onChange={(e) => setNote(s.id, e.target.value)}
                        placeholder="Optional note (e.g. Sick)"
                        className="mt-2.5 min-h-[38px] w-full rounded-lg border border-slate-200 px-3 py-1.5 text-base focus:border-indigo-500 focus:outline-none sm:text-xs"
                      />
                    </div>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-500">
                    No students match &ldquo;{search}&rdquo;.
                  </p>
                )}

                {students.length > 0 && (
                  <div className="sticky bottom-[66px] z-20 -mx-1 rounded-xl border border-indigo-200 bg-white/95 p-3 shadow-md backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={saveAttendance}
                      disabled={saving}
                      className="min-h-[44px] w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {saving
                        ? "Saving Roll Call..."
                        : `Save Attendance (${dailySummary.present}P · ${dailySummary.late}L · ${dailySummary.absent}A)`}
                    </button>
                  </div>
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="py-2.5 pr-4">#</th>
                      <th className="py-2.5 pr-4">Adm No</th>
                      <th className="py-2.5 pr-4">Student Name</th>
                      <th className="py-2.5 pr-4">Status</th>
                      <th className="py-2.5">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((s, idx) => {
                      const rec = records[s.id] ?? {
                        studentId: s.id,
                        status: "PRESENT" as AttendanceStatus,
                        note: "",
                      };
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/70">
                          <td className="py-3 pr-4 text-xs text-slate-400 tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-slate-600">
                            {s.admissionNo}
                          </td>
                          <td className="py-3 pr-4 font-medium text-slate-900">
                            {s.fullName}
                          </td>
                          <td className="py-3 pr-4">
                            <div className="inline-flex gap-1.5">
                              {(["PRESENT", "LATE", "ABSENT"] as const).map((st) => {
                                const active = rec.status === st;
                                const activeStyle =
                                  st === "PRESENT"
                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                    : st === "LATE"
                                      ? "border-amber-500 bg-amber-500 text-white"
                                      : "border-rose-600 bg-rose-600 text-white";
                                return (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => setStatus(s.id, st)}
                                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                                      active
                                        ? activeStyle
                                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                    }`}
                                  >
                                    {st}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-3">
                            <input
                              value={rec.note}
                              onChange={(e) => setNote(s.id, e.target.value)}
                              placeholder="Optional note (e.g. Sick)"
                              className="w-full max-w-xs rounded-md border border-slate-200 px-2.5 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {filteredStudents.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-sm text-slate-500">
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
      ) : (
        <Card>
          <div className="no-print mb-4 flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Class
                </label>
                <select
                  value={classId}
                  onChange={(e) => handleClassChange(e.target.value)}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
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
                  Month
                </label>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              {classId && (
                <a
                  href={`/api/teacher/attendance/monthly?classId=${encodeURIComponent(
                    classId
                  )}&month=${encodeURIComponent(month)}&format=xlsx`}
                  className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:text-sm"
                >
                  <Download className="h-4 w-4 shrink-0" />
                  Export Excel
                </a>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 sm:text-sm"
              >
                <Printer className="h-4 w-4 shrink-0" />
                Print Register
              </button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {selectedClassName} — {monthLabel || month}
              </h2>
              <p className="text-xs text-slate-500">
                Legend: <span className="font-semibold text-emerald-700">P</span> Present ·{" "}
                <span className="font-semibold text-amber-700">L</span> Late ·{" "}
                <span className="font-semibold text-rose-700">A</span> Absent · Students below
                80% attendance rate are highlighted.
              </p>
              <p className="no-print mt-1 text-[11px] font-medium text-indigo-600 md:hidden">
                ← Swipe sideways on the register below to see all days →
              </p>
            </div>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Loading monthly register...
            </p>
          ) : monthlyRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No active students found for this class.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase">
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 px-2.5 py-2">
                      Student
                    </th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                      <th key={d} className="px-1 py-2 text-center font-medium tabular-nums">
                        {d}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center text-emerald-700">P</th>
                    <th className="px-2 py-2 text-center text-amber-700">L</th>
                    <th className="px-2 py-2 text-center text-rose-700">A</th>
                    <th className="px-2.5 py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyRows.map((row) => {
                    const lowAttendance =
                      row.summary.total > 0 && row.summary.ratePercent < 80;
                    return (
                      <tr key={row.studentId} className="hover:bg-slate-50/80">
                        <td className="sticky left-0 z-10 bg-white px-2.5 py-2 whitespace-nowrap">
                          <div className="font-medium text-slate-900">{row.fullName}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {row.admissionNo}
                          </div>
                        </td>
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                          const entry = row.days[d];
                          if (!entry) {
                            return (
                              <td
                                key={d}
                                className="px-1 py-2 text-center text-slate-300"
                              >
                                ·
                              </td>
                            );
                          }
                          const letter = entry.status.slice(0, 1);
                          const color =
                            entry.status === "PRESENT"
                              ? "bg-emerald-100 text-emerald-700"
                              : entry.status === "LATE"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700";
                          return (
                            <td key={d} className="px-0.5 py-1.5 text-center">
                              <span
                                title={`${month}-${String(d).padStart(2, "0")}: ${entry.status}${
                                  entry.note ? ` (${entry.note})` : ""
                                }`}
                                className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${color}`}
                              >
                                {letter}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center font-semibold text-emerald-700 tabular-nums">
                          {row.summary.present}
                        </td>
                        <td className="px-2 py-2 text-center font-semibold text-amber-700 tabular-nums">
                          {row.summary.late}
                        </td>
                        <td className="px-2 py-2 text-center font-semibold text-rose-700 tabular-nums">
                          {row.summary.absent}
                        </td>
                        <td className="px-2.5 py-2 text-right whitespace-nowrap">
                          {row.summary.total === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold tabular-nums ${
                                lowAttendance
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {row.summary.ratePercent}%
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
      )}
    </div>
  );
}
