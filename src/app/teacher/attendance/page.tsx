"use client";

import React, { useEffect, useState } from "react";
import {
  formatHeroAttendanceDate,
  formatShiftLabel,
  getClassBadgeCode,
  getPreviousIsoDate,
  MissingYesterdayStudent,
  summarizeAttendance,
} from "@/lib/domain";
import { Card, PageHeader } from "@/components/ui";
import { ExamAttendanceView } from "@/components/ExamAttendanceView";
import {
  QuickMarkSavedPayload,
  UniversalAttendanceResult,
  UniversalAttendanceSearch,
} from "@/components/UniversalAttendanceSearch";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  Globe,
  GraduationCap,
  Printer,
  Search,
  Trash2,
  UserX,
  Users,
  X,
} from "lucide-react";

type AttendanceStatus = "PRESENT" | "ABSENT";
type AttendanceShift = "SHIFT_A" | "SHIFT_B";

type ClassOption = { id: string; name: string; level: number };
type ClassOverviewSummary = {
  classId: string;
  name: string;
  level: number;
  studentCount: number;
  recorded: boolean;
  presentCount: number;
  absentCount: number;
  recordedShifts: {
    SHIFT_A: boolean;
    SHIFT_B: boolean;
  };
};
type AttendanceOverview = {
  totalClasses: number;
  totalStudents: number;
  doneCount: number;
  classSummaries: ClassOverviewSummary[];
};
type DailyStudent = {
  id: string;
  admissionNo: string;
  fullName: string;
  gender: string;
};
type DailyRecord = {
  studentId: string;
  status: AttendanceStatus;
};

type MonthlyDayCell = {
  status: AttendanceStatus;
  shiftA?: { status: AttendanceStatus };
  shiftB?: { status: AttendanceStatus };
};

type MonthlyRow = {
  studentId: string;
  admissionNo: string;
  fullName: string;
  days: Record<number, MonthlyDayCell>;
  summary: {
    total: number;
    present: number;
    absent: number;
    ratePercent: number;
  };
  absentDays: number;
  absentShifts: number;
  meetsAbsenceThreshold: boolean;
  isPunished: boolean;
  needsPunishmentHighlight: boolean;
};

export default function TeacherAttendancePage() {
  const [tab, setTab] = useState<"daily" | "monthly" | "exam">("daily");
  const [mobileView, setMobileView] = useState<"classes" | "rollcall">("classes");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
  const [todayIso] = useState(() => new Date().toISOString().slice(0, 10));
  const [date, setDate] = useState(todayIso);
  const [shift, setShift] = useState<AttendanceShift>("SHIFT_A");
  const [recordedShifts, setRecordedShifts] = useState<{
    SHIFT_A: boolean;
    SHIFT_B: boolean;
  }>({ SHIFT_A: false, SHIFT_B: false });
  const [overview, setOverview] = useState<AttendanceOverview>({
    totalClasses: 0,
    totalStudents: 0,
    doneCount: 0,
    classSummaries: [],
  });
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [monthlyShift, setMonthlyShift] = useState<"ALL" | "SHIFT_A" | "SHIFT_B">(
    "ALL"
  );

  // Daily state
  const [students, setStudents] = useState<DailyStudent[]>([]);
  const [records, setRecords] = useState<Record<string, DailyRecord>>({});
  const [alreadyRecorded, setAlreadyRecorded] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [yesterday, setYesterday] = useState<{
    date: string;
    recorded: boolean;
    recordedShifts: { SHIFT_A: boolean; SHIFT_B: boolean };
    missingStudents: MissingYesterdayStudent[];
  }>(() => ({
    date: getPreviousIsoDate(new Date().toISOString().slice(0, 10)),
    recorded: false,
    recordedShifts: { SHIFT_A: false, SHIFT_B: false },
    missingStudents: [],
  }));
  const [showYesterdayMissing, setShowYesterdayMissing] = useState(false);

  // Monthly state
  const [monthLabel, setMonthLabel] = useState("");
  const [daysInMonth, setDaysInMonth] = useState(30);
  const [monthlyRows, setMonthlyRows] = useState<MonthlyRow[]>([]);
  const [monthlySearch, setMonthlySearch] = useState("");
  const [punishingStudentId, setPunishingStudentId] = useState<string | null>(null);

  // Universal search & cross-tab jump state
  const [mobileSearchScope, setMobileSearchScope] = useState<"class" | "all">(
    "class"
  );
  const [universalTrigger, setUniversalTrigger] = useState<{
    query: string;
    token: number;
    surface: "desktop" | "mobile";
  } | null>(null);
  const [examJumpTarget, setExamJumpTarget] = useState<{
    classId: string;
    search: string;
    token: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  async function loadDaily(
    targetClassId: string,
    targetDate: string,
    targetShift: AttendanceShift = shift
  ) {
    setLoading(true);
    setMessage(null);
    try {
      const qs = new URLSearchParams({
        date: targetDate,
        shift: targetShift,
      });
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
      setShift(data.shift === "SHIFT_B" ? "SHIFT_B" : targetShift);
      setStudents(data.students ?? []);
      setAlreadyRecorded(Boolean(data.alreadyRecorded));
      setRecordedShifts(
        data.recordedShifts ?? { SHIFT_A: false, SHIFT_B: false }
      );
      if (data.yesterday) {
        setYesterday({
          date:
            data.yesterday.date ?? getPreviousIsoDate(data.date ?? targetDate),
          recorded: Boolean(data.yesterday.recorded),
          recordedShifts: data.yesterday.recordedShifts ?? {
            SHIFT_A: false,
            SHIFT_B: false,
          },
          missingStudents: data.yesterday.missingStudents ?? [],
        });
      } else {
        setYesterday({
          date: getPreviousIsoDate(data.date ?? targetDate),
          recorded: false,
          recordedShifts: { SHIFT_A: false, SHIFT_B: false },
          missingStudents: [],
        });
      }
      if (data.overview) {
        setOverview(data.overview);
      }

      const map: Record<string, DailyRecord> = {};
      for (const s of (data.students ?? []) as DailyStudent[]) {
        const existing = (data.attendance ?? []).find(
          (a: { studentId: string; status: AttendanceStatus }) =>
            a.studentId === s.id
        );
        map[s.id] = {
          studentId: s.id,
          status: existing?.status ?? "PRESENT",
        };
      }
      setRecords(map);
    } catch {
      setMessage({ type: "err", text: "Network error loading attendance" });
    }
    setLoading(false);
  }

  async function loadMonthly(
    targetClassId: string,
    targetMonth: string,
    targetShift: "ALL" | "SHIFT_A" | "SHIFT_B" = monthlyShift
  ) {
    setLoading(true);
    setMessage(null);
    try {
      const qs = new URLSearchParams({
        month: targetMonth,
        shift: targetShift,
      });
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
    const initShift: AttendanceShift =
      params.get("shift") === "SHIFT_B" ? "SHIFT_B" : "SHIFT_A";
    const initMonth = params.get("month") ?? new Date().toISOString().slice(0, 7);
    const rawTab = params.get("tab");
    const initTab: "daily" | "monthly" | "exam" =
      rawTab === "monthly" ? "monthly" : rawTab === "exam" ? "exam" : "daily";

    setTab(initTab);
    setShift(initShift);
    if (initClass) {
      setClassId(initClass);
      setMobileView("rollcall");
    }
    if (initDate) {
      setDate(initDate);
    }
    if (initTab === "monthly") {
      void loadMonthly(initClass, initMonth, monthlyShift);
    } else if (initTab === "daily") {
      void loadDaily(initClass, initDate, initShift);
    } else {
      setLoading(false);
    }
  }, []);

  function handleSelectMobileClass(nextClassId: string) {
    setClassId(nextClassId);
    setSearch("");
    setMobileSearchScope("class");
    setMobileView("rollcall");
    void loadDaily(nextClassId, date, shift);
  }

  function handleTabChange(nextTab: "daily" | "monthly" | "exam") {
    if (nextTab === tab) return;
    setTab(nextTab);
    setMessage(null);
    if (nextTab === "monthly") {
      void loadMonthly(classId, month, monthlyShift);
    } else if (nextTab === "daily") {
      void loadDaily(classId, date, shift);
    }
  }

  function handleClassChange(nextClassId: string) {
    setClassId(nextClassId);
    if (tab === "monthly") {
      void loadMonthly(nextClassId, month, monthlyShift);
    } else {
      void loadDaily(nextClassId, date, shift);
    }
  }

  function handleDateChange(nextDate: string) {
    setDate(nextDate);
    void loadDaily(classId, nextDate, shift);
  }

  function handleShiftChange(nextShift: AttendanceShift) {
    if (nextShift === shift) return;
    setShift(nextShift);
    void loadDaily(classId, date, nextShift);
  }

  function handleMonthChange(nextMonth: string) {
    setMonth(nextMonth);
    void loadMonthly(classId, nextMonth, monthlyShift);
  }

  function handleMonthlyShiftChange(nextShift: "ALL" | "SHIFT_A" | "SHIFT_B") {
    setMonthlyShift(nextShift);
    void loadMonthly(classId, month, nextShift);
  }

  function triggerUniversalSearch(query: string) {
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches;
    if (!isDesktop && tab === "daily" && mobileView === "rollcall") {
      setMobileSearchScope("all");
    }
    setUniversalTrigger({
      query,
      token: Date.now(),
      surface: isDesktop ? "desktop" : "mobile",
    });
  }

  function handleJumpToStudent(
    student: UniversalAttendanceResult,
    targetTab: "daily" | "monthly" | "exam"
  ) {
    setMessage(null);
    const switchingClass = student.classId !== classId;
    const switchingTab = targetTab !== tab;
    setClassId(student.classId);

    if (targetTab === "daily") {
      setTab("daily");
      setMobileView("rollcall");
      setMobileSearchScope("class");
      setSearch(student.fullName);
      if (switchingClass || switchingTab) {
        void loadDaily(student.classId, date, shift);
      }
      return;
    }

    if (targetTab === "monthly") {
      setTab("monthly");
      setMonthlySearch(student.fullName);
      if (switchingClass || switchingTab) {
        void loadMonthly(student.classId, month, monthlyShift);
      }
      return;
    }

    setTab("exam");
    setExamJumpTarget({
      classId: student.classId,
      search: student.fullName,
      token: Date.now(),
    });
  }

  function handleQuickMarkSaved(payload: QuickMarkSavedPayload) {
    setMessage({
      type: "ok",
      text: `Saved ${formatShiftLabel(payload.shift)} attendance (${payload.status}) for ${payload.fullName} (${payload.className}) on ${payload.date}.`,
    });

    if (payload.date === date && payload.shift === shift) {
      if (payload.classId === classId) {
        setRecords((prev) => ({
          ...prev,
          [payload.studentId]: {
            studentId: payload.studentId,
            status: payload.status,
          },
        }));
        setAlreadyRecorded(true);
        setRecordedShifts((prev) => ({ ...prev, [payload.shift]: true }));
      }

      setOverview((prev) => {
        const updated = prev.classSummaries.map((c) => {
          if (c.classId !== payload.classId) return c;
          let presentCount = c.presentCount;
          let absentCount = c.absentCount;
          if (payload.previousStatus === null) {
            if (payload.status === "PRESENT") presentCount += 1;
            else absentCount += 1;
          } else if (
            payload.previousStatus === "PRESENT" &&
            payload.status === "ABSENT"
          ) {
            presentCount = Math.max(0, presentCount - 1);
            absentCount += 1;
          } else if (
            payload.previousStatus === "ABSENT" &&
            payload.status === "PRESENT"
          ) {
            absentCount = Math.max(0, absentCount - 1);
            presentCount += 1;
          }
          return {
            ...c,
            recorded: true,
            presentCount,
            absentCount,
            recordedShifts: { ...c.recordedShifts, [payload.shift]: true },
          };
        });
        return {
          ...prev,
          doneCount: updated.filter((c) => c.recorded).length,
          classSummaries: updated,
        };
      });
    }

    if (
      tab === "monthly" &&
      payload.classId === classId &&
      payload.date.startsWith(`${month}-`)
    ) {
      void loadMonthly(classId, month, monthlyShift);
    }
  }

  async function markStudentPunished(studentId: string) {
    if (!classId || !month) return;
    setPunishingStudentId(studentId);
    setMessage(null);
    try {
      const res = await fetch("/api/teacher/attendance/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, classId, month }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "err",
          text: data.error ?? "Failed to mark student as punished",
        });
        setPunishingStudentId(null);
        return;
      }
      setMonthlyRows((prev) =>
        prev.map((row) =>
          row.studentId === studentId
            ? { ...row, isPunished: true, needsPunishmentHighlight: false }
            : row
        )
      );
    } catch {
      setMessage({
        type: "err",
        text: "Network error while updating punishment status",
      });
    }
    setPunishingStudentId(null);
  }

  function setStatus(studentId: string, status: AttendanceStatus) {
    setRecords((prev) => ({
      ...prev,
      [studentId]: { studentId, status },
    }));
  }

  function markAll(status: AttendanceStatus) {
    setRecords(() => {
      const next: Record<string, DailyRecord> = {};
      for (const s of students) {
        next[s.id] = {
          studentId: s.id,
          status,
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
        shift,
        records: students.map(
          (s) =>
            records[s.id] ?? {
              studentId: s.id,
              status: "PRESENT",
            }
        ),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "Failed to save attendance" });
      return;
    }
    setAlreadyRecorded(true);
    setRecordedShifts((prev) => ({ ...prev, [shift]: true }));
    const savedPresent = students.filter(
      (s) => (records[s.id]?.status ?? "PRESENT") !== "ABSENT"
    ).length;
    const savedAbsent = students.length - savedPresent;
    setOverview((prev) => {
      const updated = prev.classSummaries.map((c) =>
        c.classId === classId
          ? {
              ...c,
              recorded: true,
              presentCount: savedPresent,
              absentCount: savedAbsent,
              recordedShifts: { ...c.recordedShifts, [shift]: true },
            }
          : c
      );
      return {
        ...prev,
        doneCount: updated.filter((c) => c.recorded).length,
        classSummaries: updated,
      };
    });
    setMessage({
      type: "ok",
      text: `Saved ${formatShiftLabel(shift)} attendance for ${data.saved} students on ${date}.`,
    });
  }

  async function clearDateAttendance() {
    if (!classId || !alreadyRecorded) return;
    const shiftName = formatShiftLabel(shift);
    if (
      !window.confirm(
        `Delete recorded ${shiftName} attendance for ${selectedClassName} on ${date}?`
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await fetch(
      `/api/teacher/attendance?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}&shift=${encodeURIComponent(shift)}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage({
        type: "err",
        text: data.error ?? "Failed to clear attendance",
      });
      return;
    }
    setAlreadyRecorded(false);
    setRecordedShifts((prev) => ({ ...prev, [shift]: false }));
    setMessage({
      type: "ok",
      text: `Cleared ${shiftName} attendance records for ${date}.`,
    });
    void loadDaily(classId, date, shift);
  }

  const recordList = students.map(
    (s) => records[s.id] ?? { studentId: s.id, status: "PRESENT" as AttendanceStatus }
  );
  const dailySummary = summarizeAttendance(recordList);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredStudents = normalizedSearch
    ? students.filter(
      (s) =>
        s.fullName.toLowerCase().includes(normalizedSearch) ||
        s.admissionNo.toLowerCase().includes(normalizedSearch)
    )
    : students;

  const normalizedMonthlySearch = monthlySearch.trim().toLowerCase();
  const filteredMonthlyRows = normalizedMonthlySearch
    ? monthlyRows.filter(
      (row) =>
        row.fullName.toLowerCase().includes(normalizedMonthlySearch) ||
        row.admissionNo.toLowerCase().includes(normalizedMonthlySearch)
    )
    : monthlyRows;

  const selectedClassName =
    classes.find((c) => c.id === classId)?.name ?? "Selected Class";

  const messageBanner = message ? (
    <div
      className={`no-print rounded-xl border px-4 py-3 text-sm ${
        message.type === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700"
      }`}
    >
      {message.text}
    </div>
  ) : null;

  function renderShiftToggle(variant: "hero-classes" | "hero-rollcall") {
    return (
      <div className="inline-flex rounded-xl border border-white/15 bg-white/10 p-0.5 backdrop-blur-xs">
        {(["SHIFT_A", "SHIFT_B"] as const).map((sh) => {
          const isSelected = shift === sh;
          const isDone =
            variant === "hero-classes"
              ? overview.totalClasses > 0 &&
                overview.classSummaries.every((c) => c.recordedShifts[sh])
              : recordedShifts[sh];
          return (
            <button
              key={sh}
              type="button"
              onClick={() => handleShiftChange(sh)}
              className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                isSelected
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-indigo-100 hover:bg-white/10"
              }`}
            >
              {sh === "SHIFT_A" ? "Shift A" : "Shift B"}
              {isDone && (
                <CheckCircle2
                  className={`h-3 w-3 ${
                    isSelected ? "text-emerald-200" : "text-emerald-300"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  function renderMobileTabSwitcher() {
    const mobileTabs = [
      { id: "daily" as const, label: "Daily" },
      { id: "monthly" as const, label: "Monthly" },
      { id: "exam" as const, label: "Exam" },
    ];
    return (
      <div className="inline-flex rounded-full border border-white/15 bg-white/10 p-0.5 text-[11px] font-semibold">
        {mobileTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabChange(t.id)}
            className={`rounded-full px-2.5 py-1 transition ${
              tab === t.id
                ? "bg-indigo-600 text-white"
                : "text-indigo-100 hover:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Desktop Header */}
      <div className="no-print hidden md:block">
        <PageHeader
          title="Student Attendance"
          subtitle="Daily roll call, monthly register, and subject exam attendance"
          action={
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => handleTabChange("daily")}
                className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === "daily"
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
                className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === "monthly"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                  }`}
              >
                <CalendarDays className="h-4 w-4" />
                Monthly
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("exam")}
                className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === "exam"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                  }`}
              >
                <GraduationCap className="h-4 w-4" />
                Exam Attendance
              </button>
            </div>
          }
        />
      </div>

      {/* Desktop Universal Attendance Search (All Classes) */}
      <UniversalAttendanceSearch
        date={date}
        shift={shift}
        month={month}
        activeTab={tab}
        externalQuery={
          universalTrigger?.surface === "desktop"
            ? universalTrigger.query
            : undefined
        }
        externalQueryToken={
          universalTrigger?.surface === "desktop"
            ? universalTrigger.token
            : undefined
        }
        onJumpToStudent={handleJumpToStudent}
        onQuickMarkSaved={handleQuickMarkSaved}
        onError={(text) => setMessage({ type: "err", text })}
        className="mb-4 hidden md:block"
      />

      {/* Desktop Notification */}
      {messageBanner && (
        <div className="hidden md:mb-4 md:block">{messageBanner}</div>
      )}

      {/* Mobile Monthly / Exam Compact Hero */}
      {(tab === "monthly" || tab === "exam") && (
        <div className="no-print md:hidden">
          <div className="-mx-4 -mt-6 mb-4 rounded-b-[28px] bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 px-5 pt-4 pb-5 text-white shadow-md">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold tracking-[0.14em] text-indigo-200 uppercase">
                {tab === "monthly"
                  ? monthLabel || month
                  : "By Subject & Date"}
              </span>
              {renderMobileTabSwitcher()}
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              {tab === "monthly" ? "Monthly Register" : "Exam Attendance"}
            </h1>
          </div>
          <UniversalAttendanceSearch
            date={date}
            shift={shift}
            month={month}
            activeTab={tab}
            externalQuery={
              universalTrigger?.surface === "mobile"
                ? universalTrigger.query
                : undefined
            }
            externalQueryToken={
              universalTrigger?.surface === "mobile"
                ? universalTrigger.token
                : undefined
            }
            onJumpToStudent={handleJumpToStudent}
            onQuickMarkSaved={handleQuickMarkSaved}
            onError={(text) => setMessage({ type: "err", text })}
            className="mb-4"
          />
          {messageBanner && <div className="mb-4">{messageBanner}</div>}
        </div>
      )}

      {tab === "daily" ? (
        <>
          {/* Mobile Attendance Flow (Classes Overview -> Roll Call) */}
          <div className="no-print md:hidden">
            {mobileView === "classes" ? (
              <div>
                {/* Curved Full-Bleed Hero Banner */}
                <div className="-mx-4 -mt-6 rounded-b-[28px] bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 px-5 pt-4 pb-6 text-white shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <label className="relative inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-indigo-200 uppercase">
                      <CalendarDays className="h-3.5 w-3.5 text-indigo-300" />
                      <span>{formatHeroAttendanceDate(date)}</span>
                      <input
                        type="date"
                        value={date}
                        aria-label="Select attendance date"
                        onChange={(e) => handleDateChange(e.target.value)}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                    </label>
                    {renderMobileTabSwitcher()}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <h1 className="text-3xl font-bold tracking-tight text-white">
                      Attendance
                    </h1>
                    {renderShiftToggle("hero-classes")}
                  </div>

                  {/* 3 Translucent KPI Boxes */}
                  <div className="mt-5 grid grid-cols-3 gap-2.5">
                    <div className="rounded-2xl border border-white/12 bg-white/10 px-2 py-3 text-center backdrop-blur-xs">
                      <div className="text-2xl font-bold tracking-tight text-white tabular-nums">
                        {overview.totalClasses}
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold tracking-wider text-indigo-200 uppercase">
                        CLASSES
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/12 bg-white/10 px-2 py-3 text-center backdrop-blur-xs">
                      <div className="text-2xl font-bold tracking-tight text-white tabular-nums">
                        {overview.totalStudents}
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold tracking-wider text-indigo-200 uppercase">
                        STUDENTS
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/12 bg-white/10 px-2 py-3 text-center backdrop-blur-xs">
                      <div className="text-2xl font-bold tracking-tight text-white tabular-nums">
                        {overview.doneCount}/{overview.totalClasses}
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold tracking-wider text-indigo-200 uppercase">
                        {date === todayIso ? "DONE TODAY" : "DONE"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile Universal Attendance Search */}
                <UniversalAttendanceSearch
                  date={date}
                  shift={shift}
                  month={month}
                  activeTab={tab}
                  externalQuery={
                    universalTrigger?.surface === "mobile"
                      ? universalTrigger.query
                      : undefined
                  }
                  externalQueryToken={
                    universalTrigger?.surface === "mobile"
                      ? universalTrigger.token
                      : undefined
                  }
                  onJumpToStudent={handleJumpToStudent}
                  onQuickMarkSaved={handleQuickMarkSaved}
                  onError={(text) => setMessage({ type: "err", text })}
                  className="mt-4"
                />

                {messageBanner && <div className="mt-4">{messageBanner}</div>}

                {/* Choose a Class Stack */}
                <div className="mt-6 pb-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-900">
                      Choose a class
                    </h2>
                    <span className="text-xs font-semibold text-indigo-600">
                      {formatShiftLabel(shift)}
                    </span>
                  </div>

                  {loading && overview.classSummaries.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">
                      Loading classes...
                    </p>
                  ) : overview.classSummaries.length === 0 ? (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-xs">
                      You have no classes assigned yet.
                    </div>
                  ) : (
                    <div
                      className={`mt-3 space-y-3 transition-opacity ${
                        loading ? "opacity-70" : ""
                      }`}
                    >
                      {overview.classSummaries.map((cls) => {
                        const pct =
                          cls.recorded && cls.studentCount > 0
                            ? Math.min(
                                100,
                                Math.round((cls.presentCount / cls.studentCount) * 100)
                              )
                            : 0;
                        return (
                          <button
                            key={cls.classId}
                            type="button"
                            onClick={() => handleSelectMobileClass(cls.classId)}
                            className="flex w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-xs transition hover:border-indigo-200 active:scale-[0.99]"
                          >
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-base font-bold text-indigo-900">
                              {getClassBadgeCode(cls.name)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[15px] font-semibold text-slate-900">
                                {cls.name}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500 tabular-nums">
                                <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                <span>
                                  {cls.studentCount}{" "}
                                  {cls.studentCount === 1 ? "student" : "students"}
                                </span>
                                {cls.recorded && (
                                  <>
                                    <span className="text-slate-300">·</span>
                                    <span className="font-medium text-emerald-600">
                                      {cls.presentCount} in
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span className="font-medium text-rose-600">
                                      {cls.absentCount} out
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>

                            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {/* Curved Roll Call Hero Banner */}
                <div className="-mx-4 -mt-6 rounded-b-[28px] bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 px-5 pt-4 pb-5 text-white shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setMobileView("classes")}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Classes
                    </button>
                    {renderShiftToggle("hero-rollcall")}
                  </div>

                  <div className="mt-3.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <label className="relative inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-indigo-200 uppercase">
                        <CalendarDays className="h-3.5 w-3.5 text-indigo-300" />
                        <span>{formatHeroAttendanceDate(date)}</span>
                        <input
                          type="date"
                          value={date}
                          aria-label="Select attendance date"
                          onChange={(e) => handleDateChange(e.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                      </label>
                      <h1 className="mt-0.5 truncate text-2xl font-bold tracking-tight text-white">
                        {selectedClassName}
                      </h1>
                    </div>
                    {alreadyRecorded ? (
                      <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
                        <CheckCircle2 className="h-3 w-3" />
                        Recorded
                      </span>
                    ) : (
                      <span className="mt-1 inline-flex shrink-0 items-center rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-300/30">
                        Pending
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-white/12 bg-white/10 px-2 py-2.5 text-center backdrop-blur-xs">
                      <div className="text-xl font-bold text-white tabular-nums">
                        {dailySummary.present}
                      </div>
                      <div className="text-[10px] font-semibold tracking-wider text-emerald-200 uppercase">
                        PRESENT
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/12 bg-white/10 px-2 py-2.5 text-center backdrop-blur-xs">
                      <div className="text-xl font-bold text-white tabular-nums">
                        {dailySummary.absent}
                      </div>
                      <div className="text-[10px] font-semibold tracking-wider text-rose-200 uppercase">
                        ABSENT
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowYesterdayMissing(true)}
                      className="group flex flex-col items-center justify-center rounded-2xl border border-amber-300/35 bg-amber-400/15 px-2 py-2 text-center backdrop-blur-xs transition hover:bg-amber-400/25 active:scale-[0.98]"
                      title="Show students who were missing yesterday in this class"
                    >
                      <div className="inline-flex items-center justify-center gap-0.5 text-xl font-bold text-white tabular-nums">
                        <span>{yesterday.missingStudents.length}</span>
                        <ChevronRight className="h-4 w-4 text-amber-200 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <div className="text-[9px] font-semibold tracking-wider text-amber-200 uppercase leading-tight">
                        MISSING YESTERDAY
                      </div>
                    </button>
                  </div>
                </div>

                {messageBanner && <div className="mt-4">{messageBanner}</div>}

                {/* Controls & Roll Call Cards */}
                <div className="mt-4 space-y-3 pb-4">
                  <div className="space-y-2">
                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setMobileSearchScope("class")}
                        className={`rounded-lg px-3 py-1.5 transition ${
                          mobileSearchScope === "class"
                            ? "bg-white text-slate-900 shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        This Class
                      </button>
                      <button
                        type="button"
                        onClick={() => setMobileSearchScope("all")}
                        className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 transition ${
                          mobileSearchScope === "all"
                            ? "bg-indigo-600 text-white shadow-2xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Globe className="h-3.5 w-3.5" />
                        All Classes
                      </button>
                    </div>

                    {mobileSearchScope === "all" ? (
                      <UniversalAttendanceSearch
                        date={date}
                        shift={shift}
                        month={month}
                        activeTab={tab}
                        externalQuery={
                          universalTrigger?.surface === "mobile"
                            ? universalTrigger.query
                            : undefined
                        }
                        externalQueryToken={
                          universalTrigger?.surface === "mobile"
                            ? universalTrigger.token
                            : undefined
                        }
                        onJumpToStudent={handleJumpToStudent}
                        onQuickMarkSaved={handleQuickMarkSaved}
                        onError={(text) => setMessage({ type: "err", text })}
                      />
                    ) : (
                      <div className="relative">
                        <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={`Filter in ${selectedClassName}...`}
                          className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white py-2 pr-9 pl-9 text-base shadow-2xs focus:border-indigo-500 focus:outline-none"
                        />
                        {search && (
                          <button
                            type="button"
                            onClick={() => setSearch("")}
                            aria-label="Clear class filter"
                            className="absolute top-2.5 right-2.5 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => markAll("PRESENT")}
                      disabled={students.length === 0}
                      className="min-h-[38px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50"
                    >
                      Mark All Present
                    </button>
                    <button
                      type="button"
                      onClick={() => markAll("ABSENT")}
                      disabled={students.length === 0}
                      className="min-h-[38px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50"
                    >
                      Mark All Absent
                    </button>
                    {alreadyRecorded && (
                      <button
                        type="button"
                        onClick={clearDateAttendance}
                        disabled={saving}
                        className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        title={`Delete recorded ${formatShiftLabel(shift)} attendance for this date`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear
                      </button>
                    )}
                  </div>

                  {loading ? (
                    <p className="py-10 text-center text-sm text-slate-500">
                      Loading class roster...
                    </p>
                  ) : students.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-xs">
                      No active students enrolled in this class.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {filteredStudents.map((s, idx) => {
                          const rec = records[s.id] ?? {
                            studentId: s.id,
                            status: "PRESENT" as AttendanceStatus,
                          };
                          return (
                            <div
                              key={s.id}
                              className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs"
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

                              <div className="grid grid-cols-2 gap-2">
                                {(["PRESENT", "ABSENT"] as const).map((st) => {
                                  const active = rec.status === st;
                                  const activeStyle =
                                    st === "PRESENT"
                                      ? "border-emerald-600 bg-emerald-600 text-white"
                                      : "border-rose-600 bg-rose-600 text-white";
                                  return (
                                    <button
                                      key={st}
                                      type="button"
                                      onClick={() => setStatus(s.id, st)}
                                      className={`min-h-[44px] rounded-xl border text-xs font-semibold transition ${
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
                            </div>
                          );
                        })}
                        {filteredStudents.length === 0 && (
                          <div className="py-6 text-center text-sm text-slate-500">
                            <p>
                              No students match &ldquo;{search}&rdquo; in{" "}
                              {selectedClassName}.
                            </p>
                            {search.trim() && (
                              <button
                                type="button"
                                onClick={() =>
                                  triggerUniversalSearch(search.trim())
                                }
                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                              >
                                <Globe className="h-3.5 w-3.5" />
                                Search &ldquo;{search.trim()}&rdquo; across all
                                classes
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="sticky bottom-[68px] z-20 rounded-2xl border border-indigo-200 bg-white/95 p-3 shadow-md backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={saveAttendance}
                          disabled={saving}
                          className="min-h-[44px] w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {saving
                            ? "Saving Roll Call..."
                            : `Save ${formatShiftLabel(shift)} (${dailySummary.present}P · ${dailySummary.absent}A)`}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Desktop Daily Roll Call Card */}
          <Card className="hidden md:block">
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
                  Shift (2× Daily)
                </label>
                <div className="grid grid-cols-2 rounded-lg border border-slate-300 bg-slate-50 p-0.5 sm:inline-flex">
                  {(["SHIFT_A", "SHIFT_B"] as const).map((sh) => {
                    const isSelected = shift === sh;
                    const isDone = recordedShifts[sh];
                    return (
                      <button
                        key={sh}
                        type="button"
                        onClick={() => handleShiftChange(sh)}
                        className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${isSelected
                            ? "bg-indigo-600 text-white shadow-2xs"
                            : "text-slate-700 hover:bg-white"
                          }`}
                      >
                        {sh === "SHIFT_A" ? "Shift A" : "Shift B"}
                        {isDone && (
                          <CheckCircle2
                            className={`h-3.5 w-3.5 ${isSelected ? "text-emerald-200" : "text-emerald-600"
                              }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="sm:w-auto">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Filter in Class
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-3 left-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name or Adm No..."
                    className="min-h-[42px] w-full rounded-lg border border-slate-300 py-2 pr-8 pl-8 text-base sm:w-auto sm:text-sm"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      aria-label="Clear class filter"
                      className="absolute top-2.5 right-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {classes.length > 0 && (
                alreadyRecorded ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    {formatShiftLabel(shift)} Recorded ({date})
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                    {formatShiftLabel(shift)} Pending ({date})
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
              {alreadyRecorded && (
                <button
                  type="button"
                  onClick={clearDateAttendance}
                  disabled={saving}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  title={`Delete recorded ${formatShiftLabel(shift)} attendance for this date`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear {formatShiftLabel(shift)}
                </button>
              )}
              <button
                type="button"
                onClick={saveAttendance}
                disabled={saving || students.length === 0}
                className="hidden min-h-[40px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 md:inline-flex md:items-center"
              >
                {saving ? "Saving..." : `Save ${formatShiftLabel(shift)}`}
              </button>
            </div>
          </div>

          {!loading && students.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-4">
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
                <p className="text-[11px] font-medium text-rose-600 uppercase">Absent</p>
                <p className="text-base font-bold text-rose-700 tabular-nums sm:text-lg">
                  {dailySummary.absent}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowYesterdayMissing(true)}
                className="group flex flex-col items-start justify-center rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-1.5 text-left transition hover:border-amber-300 hover:bg-amber-100/70"
                title="Show students who were missing yesterday in this class"
              >
                <span className="text-[11px] font-semibold text-amber-700 uppercase">
                  Missing Yesterday
                </span>
                <span className="mt-0.5 inline-flex items-center gap-1.5 text-base font-bold text-amber-900 tabular-nums sm:text-lg">
                  <span>{yesterday.missingStudents.length}</span>
                  <span className="text-xs font-medium text-amber-700">
                    {yesterday.missingStudents.length === 1 ? "student" : "students"} · View
                  </span>
                  <ChevronRight className="h-4 w-4 text-amber-600 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
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
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="py-2.5 pr-4">#</th>
                      <th className="py-2.5 pr-4">Adm No</th>
                      <th className="py-2.5 pr-4">Student Name</th>
                      <th className="py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((s, idx) => {
                      const rec = records[s.id] ?? {
                        studentId: s.id,
                        status: "PRESENT" as AttendanceStatus,
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
                          <td className="py-3">
                            <div className="inline-flex gap-1.5">
                              {(["PRESENT", "ABSENT"] as const).map((st) => {
                                const active = rec.status === st;
                                const activeStyle =
                                  st === "PRESENT"
                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                    : "border-rose-600 bg-rose-600 text-white";
                                return (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => setStatus(s.id, st)}
                                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${active
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
                        </tr>
                      );
                    })}
                    {filteredStudents.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-sm text-slate-500">
                          <p>
                            No students match &ldquo;{search}&rdquo; in{" "}
                            {selectedClassName}.
                          </p>
                          {search.trim() && (
                            <button
                              type="button"
                              onClick={() =>
                                triggerUniversalSearch(search.trim())
                              }
                              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                            >
                              <Globe className="h-3.5 w-3.5" />
                              Search &ldquo;{search.trim()}&rdquo; across all
                              classes
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
          )}
          </Card>

          {showYesterdayMissing && (
            <div
              className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-2xs"
              onClick={() => setShowYesterdayMissing(false)}
            >
              <div
                className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-amber-700 uppercase">
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span>{formatHeroAttendanceDate(yesterday.date)}</span>
                      <span className="text-slate-400">({yesterday.date})</span>
                    </div>
                    <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                      Missing Yesterday — {selectedClassName}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowYesterdayMissing(false)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-600"
                    aria-label="Close modal"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-5">
                  {!yesterday.recorded ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                      <UserX className="mx-auto h-8 w-8 text-slate-400" />
                      <p className="mt-2 text-sm font-semibold text-slate-800">
                        No attendance recorded yesterday
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Attendance was not recorded for {selectedClassName} on{" "}
                        {yesterday.date}.
                      </p>
                    </div>
                  ) : yesterday.missingStudents.length === 0 ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-6 text-center">
                      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                      <p className="mt-2 text-sm font-semibold text-emerald-900">
                        No students were missing yesterday
                      </p>
                      <p className="mt-1 text-xs text-emerald-700">
                        All recorded students in {selectedClassName} were present on{" "}
                        {yesterday.date}.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                          <UserX className="h-3.5 w-3.5" />
                          {yesterday.missingStudents.length}{" "}
                          {yesterday.missingStudents.length === 1
                            ? "student was absent"
                            : "students were absent"}
                        </span>
                        <span className="text-xs text-slate-500">
                          Recorded:{" "}
                          {[
                            yesterday.recordedShifts.SHIFT_A ? "Shift A" : null,
                            yesterday.recordedShifts.SHIFT_B ? "Shift B" : null,
                          ]
                            .filter(Boolean)
                            .join(" & ")}
                        </span>
                      </div>

                      <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                        {yesterday.missingStudents.map((stu, idx) => {
                          const todayStatus =
                            records[stu.id]?.status ?? "PRESENT";
                          return (
                            <div
                              key={stu.id}
                              className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-slate-50/80"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  <span className="mr-1.5 text-xs font-normal text-slate-400 tabular-nums">
                                    #{idx + 1}
                                  </span>
                                  {stu.fullName}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono text-[11px] text-slate-500">
                                    {stu.admissionNo}
                                  </span>
                                  {stu.absentShifts.map((sh) => (
                                    <span
                                      key={sh}
                                      className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
                                    >
                                      Absent {formatShiftLabel(sh)}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="shrink-0 text-right">
                                <div className="text-[10px] font-medium text-slate-400 uppercase">
                                  Today
                                </div>
                                <span
                                  className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    todayStatus === "PRESENT"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-rose-100 text-rose-700"
                                  }`}
                                >
                                  {todayStatus}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setShowYesterdayMissing(false)}
                    className="min-h-[38px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : tab === "monthly" ? (
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
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Shift View
                </label>
                <select
                  value={monthlyShift}
                  onChange={(e) =>
                    handleMonthlyShiftChange(
                      e.target.value as "ALL" | "SHIFT_A" | "SHIFT_B"
                    )
                  }
                  className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
                >
                  <option value="ALL">Both Shifts (A & B)</option>
                  <option value="SHIFT_A">Shift A Only</option>
                  <option value="SHIFT_B">Shift B Only</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Filter in Class
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-3 left-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={monthlySearch}
                    onChange={(e) => setMonthlySearch(e.target.value)}
                    placeholder="Name or Adm No..."
                    className="min-h-[42px] w-full rounded-lg border border-slate-300 py-2 pr-8 pl-8 text-base sm:w-auto sm:text-sm"
                  />
                  {monthlySearch && (
                    <button
                      type="button"
                      onClick={() => setMonthlySearch("")}
                      aria-label="Clear monthly class filter"
                      className="absolute top-2.5 right-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              {classId && (
                <a
                  href={`/api/teacher/attendance/monthly?classId=${encodeURIComponent(
                    classId
                  )}&month=${encodeURIComponent(month)}&shift=${encodeURIComponent(
                    monthlyShift
                  )}&format=xlsx`}
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
                {selectedClassName} — {monthLabel || month}{" "}
                <span className="text-sm font-medium text-indigo-600">
                  (
                  {monthlyShift === "ALL"
                    ? "Shift A & Shift B"
                    : formatShiftLabel(monthlyShift)}
                  )
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Legend: <span className="font-semibold text-emerald-700">P</span> Present ·{" "}
                <span className="font-semibold text-rose-700">A</span> Absent
                {monthlyShift === "ALL"
                  ? " · Cells show Shift A / Shift B · "
                  : " · "}
                Students absent 3+ days or 3+ shifts are highlighted until marked Punished.
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
                    <th className="px-2 py-2 text-center text-rose-700">A</th>
                    <th className="px-2.5 py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMonthlyRows.map((row) => {
                    const lowAttendance =
                      row.summary.total > 0 && row.summary.ratePercent < 80;
                    const isHighlighted = row.needsPunishmentHighlight;
                    return (
                      <tr
                        key={row.studentId}
                        className={
                          isHighlighted
                            ? "bg-rose-50/90 hover:bg-rose-100/70"
                            : "hover:bg-slate-50/80"
                        }
                      >
                        <td
                          className={`sticky left-0 z-10 px-2.5 py-2 whitespace-nowrap ${
                            isHighlighted
                              ? "border-l-4 border-l-rose-500 bg-rose-50"
                              : "bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2.5">
                            <div>
                              <div
                                className={`font-medium ${
                                  isHighlighted ? "text-rose-950" : "text-slate-900"
                                }`}
                              >
                                {row.fullName}
                              </div>
                              <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                                <span>{row.admissionNo}</span>
                                {isHighlighted && (
                                  <span className="rounded bg-rose-100 px-1 py-0.5 font-sans text-[10px] font-semibold text-rose-700">
                                    {row.absentDays}d / {row.absentShifts}s absent
                                  </span>
                                )}
                              </div>
                            </div>
                            {isHighlighted && (
                              <button
                                type="button"
                                onClick={() => markStudentPunished(row.studentId)}
                                disabled={punishingStudentId === row.studentId}
                                className="no-print shrink-0 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white shadow-2xs transition hover:bg-rose-700 disabled:opacity-50"
                                title="Mark student as punished and remove highlight"
                              >
                                {punishingStudentId === row.studentId
                                  ? "Saving..."
                                  : "Punished"}
                              </button>
                            )}
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
                          const badgeColor = (st: AttendanceStatus) =>
                            st === "PRESENT"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700";

                          if (monthlyShift === "ALL") {
                            const aSt = entry.shiftA?.status;
                            const bSt = entry.shiftB?.status;
                            const tipParts = [
                              aSt ? `Shift A: ${aSt}` : "Shift A: —",
                              bSt ? `Shift B: ${bSt}` : "Shift B: —",
                            ];
                            return (
                              <td key={d} className="px-0.5 py-1.5 text-center">
                                <span
                                  title={`${month}-${String(d).padStart(2, "0")} — ${tipParts.join(" | ")}`}
                                  className="inline-flex items-center gap-0.5"
                                >
                                  <span
                                    className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${aSt
                                        ? badgeColor(aSt)
                                        : "bg-slate-100 text-slate-400"
                                      }`}
                                  >
                                    {aSt ? aSt.slice(0, 1) : "-"}
                                  </span>
                                  <span
                                    className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold ${bSt
                                        ? badgeColor(bSt)
                                        : "bg-slate-100 text-slate-400"
                                      }`}
                                  >
                                    {bSt ? bSt.slice(0, 1) : "-"}
                                  </span>
                                </span>
                              </td>
                            );
                          }

                          const letter = entry.status.slice(0, 1);
                          const color = badgeColor(entry.status);
                          return (
                            <td key={d} className="px-0.5 py-1.5 text-center">
                              <span
                                title={`${month}-${String(d).padStart(2, "0")} (${formatShiftLabel(monthlyShift)}): ${entry.status}`}
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
                        <td className="px-2 py-2 text-center font-semibold text-rose-700 tabular-nums">
                          {row.summary.absent}
                        </td>
                        <td className="px-2.5 py-2 text-right whitespace-nowrap">
                          {row.summary.total === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold tabular-nums ${lowAttendance
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
                  {filteredMonthlyRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={daysInMonth + 4}
                        className="py-6 text-center text-sm text-slate-500"
                      >
                        <p>
                          No students match &ldquo;{monthlySearch}&rdquo; in{" "}
                          {selectedClassName}.
                        </p>
                        {monthlySearch.trim() && (
                          <button
                            type="button"
                            onClick={() =>
                              triggerUniversalSearch(monthlySearch.trim())
                            }
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            <Globe className="h-3.5 w-3.5" />
                            Search &ldquo;{monthlySearch.trim()}&rdquo; across
                            all classes
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <ExamAttendanceView
          initialClassId={classId}
          initialDate={date}
          externalTarget={examJumpTarget}
          onUniversalSearch={triggerUniversalSearch}
          onMessage={setMessage}
        />
      )}
    </div>
  );
}
