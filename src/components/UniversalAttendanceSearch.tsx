"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatShiftLabel } from "@/lib/domain";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  Globe,
  GraduationCap,
  Loader2,
  Search,
  X,
} from "lucide-react";

export type AttendanceStatus = "PRESENT" | "ABSENT";
export type AttendanceShift = "SHIFT_A" | "SHIFT_B";
export type AttendanceTab = "daily" | "monthly" | "exam";

export type UniversalAttendanceResult = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  gender: string;
  classId: string;
  className: string;
  classLevel: number;
  daily: {
    shiftA: AttendanceStatus | null;
    shiftB: AttendanceStatus | null;
  };
  monthly: {
    total: number;
    present: number;
    absent: number;
    ratePercent: number;
    absentDays: number;
    absentShifts: number;
    isPunished: boolean;
    needsPunishmentHighlight: boolean;
  };
};

export type QuickMarkSavedPayload = {
  studentId: string;
  classId: string;
  className: string;
  fullName: string;
  date: string;
  shift: AttendanceShift;
  status: AttendanceStatus;
  previousStatus: AttendanceStatus | null;
};

type UniversalAttendanceSearchProps = {
  date: string;
  shift: AttendanceShift;
  month: string;
  activeTab: AttendanceTab;
  externalQuery?: string;
  externalQueryToken?: number;
  onJumpToStudent: (
    student: UniversalAttendanceResult,
    targetTab: AttendanceTab
  ) => void;
  onQuickMarkSaved: (payload: QuickMarkSavedPayload) => void;
  onError?: (text: string) => void;
  className?: string;
};

export function UniversalAttendanceSearch({
  date,
  shift,
  month,
  activeTab,
  externalQuery,
  externalQueryToken,
  onJumpToStudent,
  onQuickMarkSaved,
  onError,
  className = "",
}: UniversalAttendanceSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UniversalAttendanceResult[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [monthLabel, setMonthLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (externalQueryToken && externalQuery !== undefined) {
      setQuery(externalQuery);
      inputRef.current?.focus();
    }
  }, [externalQuery, externalQueryToken]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setTotalMatches(0);
      setFetchError(null);
      setLoading(false);
      setHasSearched(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setFetchError(null);

    const timer = window.setTimeout(async () => {
      try {
        const qs = new URLSearchParams({
          q: trimmed,
          date,
          month,
        });
        const res = await fetch(
          `/api/teacher/attendance/search?${qs.toString()}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        if (!res.ok) {
          setFetchError(data.error ?? "Failed to search attendance");
          setResults([]);
          setTotalMatches(0);
          setHasSearched(true);
          setLoading(false);
          return;
        }
        setResults(data.results ?? []);
        setTotalMatches(data.totalMatches ?? 0);
        setMonthLabel(data.monthLabel ?? month);
        setHasSearched(true);
        setLoading(false);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setFetchError("Network error while searching attendance");
        setResults([]);
        setTotalMatches(0);
        setHasSearched(true);
        setLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, date, month]);

  async function handleQuickMark(
    student: UniversalAttendanceResult,
    nextStatus: AttendanceStatus
  ) {
    const previousStatus =
      shift === "SHIFT_B" ? student.daily.shiftB : student.daily.shiftA;
    if (previousStatus === nextStatus) return;

    setMarkingId(student.studentId);
    setFetchError(null);
    try {
      const res = await fetch("/api/teacher/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: student.classId,
          date,
          shift,
          records: [{ studentId: student.studentId, status: nextStatus }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error ?? "Failed to update student attendance";
        setFetchError(errMsg);
        onError?.(errMsg);
        setMarkingId(null);
        return;
      }

      setResults((prev) =>
        prev.map((row) => {
          if (row.studentId !== student.studentId) return row;
          const nextDaily = {
            ...row.daily,
            ...(shift === "SHIFT_B"
              ? { shiftB: nextStatus }
              : { shiftA: nextStatus }),
          };

          // Also keep monthly counts visually in sync if date falls within the active month
          let nextMonthly = row.monthly;
          if (date.startsWith(`${month}-`)) {
            let present = row.monthly.present;
            let absent = row.monthly.absent;
            if (previousStatus === null) {
              if (nextStatus === "PRESENT") present += 1;
              else absent += 1;
            } else if (previousStatus === "PRESENT" && nextStatus === "ABSENT") {
              present = Math.max(0, present - 1);
              absent += 1;
            } else if (previousStatus === "ABSENT" && nextStatus === "PRESENT") {
              absent = Math.max(0, absent - 1);
              present += 1;
            }
            const total = present + absent;
            const ratePercent =
              total === 0 ? 0 : Math.round((present / total) * 1000) / 10;
            nextMonthly = {
              ...row.monthly,
              total,
              present,
              absent,
              ratePercent,
            };
          }

          return {
            ...row,
            daily: nextDaily,
            monthly: nextMonthly,
          };
        })
      );

      onQuickMarkSaved({
        studentId: student.studentId,
        classId: student.classId,
        className: student.className,
        fullName: student.fullName,
        date,
        shift,
        status: nextStatus,
        previousStatus,
      });
    } catch {
      const errMsg = "Network error while saving attendance";
      setFetchError(errMsg);
      onError?.(errMsg);
    }
    setMarkingId(null);
  }

  function handleJump(
    student: UniversalAttendanceResult,
    targetTab: AttendanceTab
  ) {
    onJumpToStudent(student, targetTab);
    setQuery("");
  }

  const trimmedQuery = query.trim();

  function renderShiftPill(label: string, status: AttendanceStatus | null) {
    if (status === "PRESENT") {
      return (
        <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
          {label}: Present
        </span>
      );
    }
    if (status === "ABSENT") {
      return (
        <span className="inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200/80">
          {label}: Absent
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
        {label}: Pending
      </span>
    );
  }

  return (
    <div className={`no-print ${className}`}>
      <div className="rounded-2xl border border-indigo-100 bg-white p-2.5 shadow-xs sm:p-3">
        <div className="relative flex items-center">
          <div className="pointer-events-none absolute left-3 flex items-center text-indigo-500">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                inputRef.current?.blur();
              }
            }}
            aria-label="Universal attendance search across all classes"
            placeholder="Search any student across all classes (name, Adm No, class, phone)..."
            className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pr-28 pl-9 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none sm:pr-32 sm:text-sm"
          />
          <div className="absolute right-2 flex items-center gap-1.5">
            {trimmedQuery ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
                aria-label="Clear universal search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200/70">
              <Globe className="h-3 w-3" />
              All Classes
            </span>
          </div>
        </div>

        {/* Universal Search Results Panel */}
        {trimmedQuery.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/90 px-3.5 py-2 text-xs">
              <div className="font-medium text-slate-700">
                {loading && !hasSearched ? (
                  <span>Searching all classes...</span>
                ) : totalMatches === 0 ? (
                  <span>No matching students found across your classes</span>
                ) : totalMatches > results.length ? (
                  <span>
                    Showing top <strong>{results.length}</strong> of{" "}
                    <strong>{totalMatches}</strong> students across all classes
                  </span>
                ) : (
                  <span>
                    Found <strong>{totalMatches}</strong>{" "}
                    {totalMatches === 1 ? "student" : "students"} across all
                    classes
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span>
                  Date: <strong className="text-slate-700">{date}</strong> (
                  {formatShiftLabel(shift)})
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  Month:{" "}
                  <strong className="text-slate-700">
                    {monthLabel || month}
                  </strong>
                </span>
              </div>
            </div>

            {fetchError ? (
              <div className="px-4 py-4 text-center text-xs font-medium text-rose-600">
                {fetchError}
              </div>
            ) : loading && results.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">
                Searching students and attendance records...
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                No active students match &ldquo;{trimmedQuery}&rdquo; in any
                assigned class.
              </div>
            ) : (
              <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
                {results.map((student) => {
                  const activeShiftStatus =
                    shift === "SHIFT_B"
                      ? student.daily.shiftB
                      : student.daily.shiftA;
                  const isMarking = markingId === student.studentId;
                  const lowRate =
                    student.monthly.total > 0 &&
                    student.monthly.ratePercent < 80;

                  return (
                    <div
                      key={student.studentId}
                      className={`flex flex-col gap-3 px-3.5 py-3 transition hover:bg-slate-50/80 lg:flex-row lg:items-center lg:justify-between ${
                        student.monthly.needsPunishmentHighlight
                          ? "bg-rose-50/40"
                          : ""
                      }`}
                    >
                      {/* Student identity + class badge */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleJump(student, activeTab)}
                            className="truncate text-left text-sm font-semibold text-slate-900 hover:text-indigo-700 hover:underline"
                          >
                            {student.fullName}
                          </button>
                          <span className="inline-flex shrink-0 items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200/70">
                            {student.className}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">
                            {student.admissionNo}
                          </span>
                          <Link
                            href={`/teacher/students/${student.studentId}`}
                            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-400 hover:text-indigo-600"
                            title="Open student profile"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>

                        {/* Daily + Monthly Attendance Snapshot */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {renderShiftPill("Shift A", student.daily.shiftA)}
                          {renderShiftPill("Shift B", student.daily.shiftB)}
                          <span className="text-slate-300">|</span>
                          {student.monthly.total > 0 ? (
                            <span
                              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                                lowRate
                                  ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              Month: {student.monthly.ratePercent}% (
                              {student.monthly.present}P ·{" "}
                              {student.monthly.absent}A)
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Month: No records
                            </span>
                          )}
                          {student.monthly.needsPunishmentHighlight && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              <AlertTriangle className="h-3 w-3" />
                              {student.monthly.absentDays}d /{" "}
                              {student.monthly.absentShifts}s absent
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quick Mark + Open Class Actions */}
                      <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                        <div
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
                          title={`Quick mark ${formatShiftLabel(shift)} on ${date}`}
                        >
                          <span className="px-1.5 text-[10px] font-semibold text-slate-500 uppercase">
                            {shift === "SHIFT_B" ? "B" : "A"}
                          </span>
                          {(["PRESENT", "ABSENT"] as const).map((st) => {
                            const active = activeShiftStatus === st;
                            const activeStyle =
                              st === "PRESENT"
                                ? "bg-emerald-600 text-white shadow-2xs"
                                : "bg-rose-600 text-white shadow-2xs";
                            return (
                              <button
                                key={st}
                                type="button"
                                disabled={isMarking}
                                onClick={() => handleQuickMark(student, st)}
                                className={`min-h-[30px] rounded-md px-2 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
                                  active
                                    ? activeStyle
                                    : "bg-white text-slate-600 hover:bg-slate-100"
                                }`}
                              >
                                {st === "PRESENT" ? "Present" : "Absent"}
                              </button>
                            );
                          })}
                        </div>

                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleJump(student, "daily")}
                            className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                              activeTab === "daily"
                                ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                            title={`Open ${student.className} in Daily Roll Call`}
                          >
                            <ClipboardCheck className="h-3 w-3" />
                            Daily
                          </button>
                          <button
                            type="button"
                            onClick={() => handleJump(student, "monthly")}
                            className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                              activeTab === "monthly"
                                ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                            title={`Open ${student.className} in Monthly Register`}
                          >
                            <CalendarDays className="h-3 w-3" />
                            Monthly
                          </button>
                          <button
                            type="button"
                            onClick={() => handleJump(student, "exam")}
                            className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                              activeTab === "exam"
                                ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                            title={`Open ${student.className} in Exam Attendance`}
                          >
                            <GraduationCap className="h-3 w-3" />
                            Exam
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

