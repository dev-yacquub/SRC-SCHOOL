"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  buildExamSubjectSummaries,
  deriveExamRollCallStates,
  summarizeAttendance,
} from "@/lib/domain";
import { Card } from "@/components/ui";
import {
  CheckCircle2,
  Download,
  Printer,
  Search,
  Trash2,
} from "lucide-react";

type AttendanceStatus = "PRESENT" | "ABSENT";

type ClassOption = { id: string; name: string; level: number };
type ExamOption = {
  id: string;
  name: string;
  term: { name: string };
};
type SubjectOption = { id: string; name: string; code: string };
type ExamStudent = {
  id: string;
  admissionNo: string;
  fullName: string;
  gender: string;
};
type ExamAttendanceRow = {
  id: string;
  studentId: string;
  subjectId: string;
  status: AttendanceStatus;
  note: string | null;
};

type ExamAttendanceViewProps = {
  initialClassId?: string;
  initialDate?: string;
  onMessage: (msg: { type: "ok" | "err"; text: string } | null) => void;
};

/** Parse an API response safely so non-JSON 500/404 error pages surface HTTP status instead of looking like network failures. */
async function readJsonSafely(
  res: Response,
  fallbackError: string
): Promise<{
  data: ReturnType<typeof JSON.parse> | null;
  errorMessage: string | null;
}> {
  const raw = await res.text();
  let data: ReturnType<typeof JSON.parse> | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const serverError =
      data && typeof data === "object" && typeof data.error === "string"
        ? data.error
        : null;
    return {
      data,
      errorMessage: serverError ?? `${fallbackError} (HTTP ${res.status})`,
    };
  }
  if (!data || typeof data !== "object") {
    return {
      data: null,
      errorMessage: `${fallbackError}: invalid response from server (HTTP ${res.status})`,
    };
  }
  return { data, errorMessage: null };
}

/**
 * Exam attendance sheet chosen by class, date, optional exam, and one or more subjects
 * (allowing multiple exam subjects on the same day or combined into one roll call).
 */
export function ExamAttendanceView({
  initialClassId = "",
  initialDate,
  onMessage,
}: ExamAttendanceViewProps) {
  const [todayIso] = useState(() => new Date().toISOString().slice(0, 10));
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [classId, setClassId] = useState(initialClassId);
  const [examId, setExamId] = useState("");
  const [date, setDate] = useState(initialDate || todayIso);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [students, setStudents] = useState<ExamStudent[]>([]);
  const [serverRecords, setServerRecords] = useState<ExamAttendanceRow[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>(
    {}
  );
  const [editedStudentIds, setEditedStudentIds] = useState<Set<string>>(
    () => new Set()
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadExamAttendance(
    targetClassId: string,
    targetDate: string,
    targetExamId: string,
    preserveSubjects?: string[],
    keepMessage = false
  ) {
    setLoading(true);
    if (!keepMessage) onMessage(null);
    try {
      const qs = new URLSearchParams({ date: targetDate });
      if (targetClassId) qs.set("classId", targetClassId);
      if (targetExamId) qs.set("examId", targetExamId);

      const res = await fetch(`/api/teacher/attendance/exam?${qs.toString()}`);
      const { data, errorMessage } = await readJsonSafely(
        res,
        "Failed to load exam attendance"
      );
      if (errorMessage || !data) {
        onMessage({
          type: "err",
          text: errorMessage ?? "Failed to load exam attendance",
        });
        setLoading(false);
        return;
      }

      const nextClasses: ClassOption[] = data.classes ?? [];
      const nextExams: ExamOption[] = data.exams ?? [];
      const nextSubjects: SubjectOption[] = data.subjects ?? [];
      const nextStudents: ExamStudent[] = data.students ?? [];
      const nextRecords: ExamAttendanceRow[] = data.records ?? [];
      const validSubjectSet = new Set(nextSubjects.map((s) => s.id));

      const recordedSummaries = buildExamSubjectSummaries(
        nextSubjects,
        nextRecords
      );
      let nextSelectedSubjects: string[] = [];
      if (preserveSubjects !== undefined) {
        nextSelectedSubjects = preserveSubjects.filter((id) =>
          validSubjectSet.has(id)
        );
      } else if (recordedSummaries.length > 0) {
        nextSelectedSubjects = recordedSummaries.map((rs) => rs.subjectId);
      } else if (nextSubjects.length > 0) {
        nextSelectedSubjects = [nextSubjects[0].id];
      }

      const derived = deriveExamRollCallStates(
        nextStudents.map((s) => s.id),
        nextSelectedSubjects,
        nextRecords
      );
      const nextStatusMap: Record<string, AttendanceStatus> = {};
      for (const s of nextStudents) {
        nextStatusMap[s.id] = derived[s.id]?.status ?? "PRESENT";
      }

      setClasses(nextClasses);
      setExams(nextExams);
      setSubjects(nextSubjects);
      setClassId(data.selectedClassId ?? "");
      setExamId(data.selectedExamId ?? "");
      setDate(data.date ?? targetDate);
      setStudents(nextStudents);
      setServerRecords(nextRecords);
      setSelectedSubjectIds(nextSelectedSubjects);
      setStatusMap(nextStatusMap);
      setEditedStudentIds(new Set());
    } catch {
      onMessage({ type: "err", text: "Network error loading exam attendance" });
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadExamAttendance(initialClassId, initialDate || todayIso, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncRollCallFromSubjects(
    nextSubjectIds: string[],
    editedSet: Set<string> = editedStudentIds
  ) {
    const derived = deriveExamRollCallStates(
      students.map((s) => s.id),
      nextSubjectIds,
      serverRecords
    );
    setStatusMap((prev) => {
      const next = { ...prev };
      for (const s of students) {
        if (!editedSet.has(s.id)) {
          next[s.id] = derived[s.id]?.status ?? "PRESENT";
        }
      }
      return next;
    });
  }

  function toggleSubject(subjId: string) {
    const exists = selectedSubjectIds.includes(subjId);
    const next = exists
      ? selectedSubjectIds.filter((id) => id !== subjId)
      : [...selectedSubjectIds, subjId];
    setSelectedSubjectIds(next);
    syncRollCallFromSubjects(next);
  }

  function applySubjectSelection(nextSubjectIds: string[], resetEdits = false) {
    const nextEdited = resetEdits ? new Set<string>() : editedStudentIds;
    if (resetEdits) setEditedStudentIds(nextEdited);
    setSelectedSubjectIds(nextSubjectIds);
    syncRollCallFromSubjects(nextSubjectIds, nextEdited);
  }

  function handleStudentStatus(studentId: string, status: AttendanceStatus) {
    setEditedStudentIds((prev) => {
      const next = new Set(prev);
      next.add(studentId);
      return next;
    });
    setStatusMap((prev) => ({ ...prev, [studentId]: status }));
  }

  function markAll(status: AttendanceStatus) {
    setEditedStudentIds(new Set(students.map((s) => s.id)));
    const next: Record<string, AttendanceStatus> = {};
    for (const s of students) {
      next[s.id] = status;
    }
    setStatusMap(next);
  }

  const subjectLookup = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects]
  );

  const recordedSubjects = useMemo(
    () => buildExamSubjectSummaries(subjects, serverRecords),
    [subjects, serverRecords]
  );

  const recordedSubjectMap = useMemo(
    () => new Map(recordedSubjects.map((rs) => [rs.subjectId, rs])),
    [recordedSubjects]
  );

  const studentRecordedByDate = useMemo(() => {
    const map = new Map<
      string,
      { subjectId: string; code: string; name: string; status: AttendanceStatus }[]
    >();
    for (const r of serverRecords) {
      const subj = subjectLookup.get(r.subjectId);
      if (!subj) continue;
      const list = map.get(r.studentId) ?? [];
      list.push({
        subjectId: r.subjectId,
        code: subj.code,
        name: subj.name,
        status: r.status,
      });
      map.set(r.studentId, list);
    }
    return map;
  }, [serverRecords, subjectLookup]);

  const rollCallDerived = useMemo(
    () =>
      deriveExamRollCallStates(
        students.map((s) => s.id),
        selectedSubjectIds,
        serverRecords
      ),
    [students, selectedSubjectIds, serverRecords]
  );

  const selectedHasRecorded = useMemo(
    () => selectedSubjectIds.some((id) => recordedSubjectMap.has(id)),
    [selectedSubjectIds, recordedSubjectMap]
  );

  const summary = useMemo(
    () =>
      summarizeAttendance(
        students.map((s) => ({ status: statusMap[s.id] ?? "PRESENT" }))
      ),
    [students, statusMap]
  );

  const normalizedSearch = search.trim().toLowerCase();
  const filteredStudents = useMemo(
    () =>
      normalizedSearch
        ? students.filter(
            (s) =>
              s.fullName.toLowerCase().includes(normalizedSearch) ||
              s.admissionNo.toLowerCase().includes(normalizedSearch)
          )
        : students,
    [students, normalizedSearch]
  );

  const selectedClassName =
    classes.find((c) => c.id === classId)?.name ?? "Selected Class";
  const selectedSubjectNames = selectedSubjectIds
    .map((id) => subjectLookup.get(id)?.name)
    .filter((n): n is string => Boolean(n));

  async function saveExamAttendance() {
    if (!classId || students.length === 0 || selectedSubjectIds.length === 0) {
      return;
    }
    setSaving(true);
    onMessage(null);
    try {
      const res = await fetch("/api/teacher/attendance/exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          examId,
          date,
          subjectIds: selectedSubjectIds,
          records: students.map((s) => ({
            studentId: s.id,
            status: statusMap[s.id] ?? "PRESENT",
          })),
        }),
      });
      const { data, errorMessage } = await readJsonSafely(
        res,
        "Failed to save exam attendance"
      );
      setSaving(false);
      if (errorMessage || !data) {
        onMessage({
          type: "err",
          text: errorMessage ?? "Failed to save exam attendance",
        });
        return;
      }

      onMessage({
        type: "ok",
        text: `Saved exam attendance for ${data.savedStudents} student${data.savedStudents === 1 ? "" : "s"} across ${selectedSubjectNames.join(", ")} on ${date}.`,
      });
      await loadExamAttendance(
        classId,
        date,
        examId,
        selectedSubjectIds,
        true
      );
    } catch {
      setSaving(false);
      onMessage({ type: "err", text: "Network error saving exam attendance" });
    }
  }

  async function clearSelectedExamAttendance() {
    if (!classId || selectedSubjectIds.length === 0 || !selectedHasRecorded) {
      return;
    }
    if (
      !window.confirm(
        `Delete recorded exam attendance for ${selectedClassName} (${selectedSubjectNames.join(", ")}) on ${date}?`
      )
    ) {
      return;
    }

    setSaving(true);
    onMessage(null);
    const qs = new URLSearchParams({
      classId,
      date,
      subjectIds: selectedSubjectIds.join(","),
    });
    if (examId) qs.set("examId", examId);

    try {
      const res = await fetch(`/api/teacher/attendance/exam?${qs.toString()}`, {
        method: "DELETE",
      });
      const { data, errorMessage } = await readJsonSafely(
        res,
        "Failed to clear exam attendance"
      );
      setSaving(false);
      if (errorMessage || !data) {
        onMessage({
          type: "err",
          text: errorMessage ?? "Failed to clear exam attendance",
        });
        return;
      }

      onMessage({
        type: "ok",
        text: `Cleared ${data.deleted} exam attendance record${data.deleted === 1 ? "" : "s"} for ${date}.`,
      });
      await loadExamAttendance(
        classId,
        date,
        examId,
        selectedSubjectIds,
        true
      );
    } catch {
      setSaving(false);
      onMessage({ type: "err", text: "Network error clearing exam attendance" });
    }
  }

  const excelHref = `/api/teacher/attendance/exam?classId=${encodeURIComponent(
    classId
  )}&date=${encodeURIComponent(date)}${
    examId ? `&examId=${encodeURIComponent(examId)}` : ""
  }${
    selectedSubjectIds.length > 0
      ? `&subjectIds=${encodeURIComponent(selectedSubjectIds.join(","))}`
      : ""
  }&format=xlsx`;

  return (
    <Card>
      {/* Controls & Multi-Subject Picker */}
      <div className="no-print mb-4 space-y-4 border-b border-slate-100 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Class
              </label>
              <select
                value={classId}
                disabled={classes.length === 0}
                onChange={(e) =>
                  void loadExamAttendance(e.target.value, date, examId)
                }
                className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base disabled:bg-slate-50 sm:w-auto sm:text-sm"
              >
                {classes.length === 0 ? (
                  <option value="">No classes available</option>
                ) : (
                  classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Exam Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) =>
                  void loadExamAttendance(
                    classId,
                    e.target.value,
                    examId,
                    selectedSubjectIds
                  )
                }
                className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Examination (Optional)
              </label>
              <select
                value={examId}
                onChange={(e) =>
                  void loadExamAttendance(
                    classId,
                    date,
                    e.target.value,
                    selectedSubjectIds
                  )
                }
                className="min-h-[42px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base sm:w-auto sm:text-sm"
              >
                <option value="">General / All Exams</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} ({ex.term.name})
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
            {classId && subjects.length > 0 && (
              <a
                href={excelHref}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </a>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Sheet
            </button>
            <button
              type="button"
              onClick={saveExamAttendance}
              disabled={
                saving ||
                students.length === 0 ||
                selectedSubjectIds.length === 0
              }
              className="hidden min-h-[40px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 md:inline-flex md:items-center"
            >
              {saving
                ? "Saving..."
                : selectedSubjectIds.length > 1
                  ? `Save Exam Attendance (${selectedSubjectIds.length} Subjects)`
                  : "Save Exam Attendance"}
            </button>
          </div>
        </div>

        {/* Multi-Subject Selector for Exam Sitting */}
        {subjects.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-800 uppercase">
                  Subject(s) for {date}
                </span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                  {selectedSubjectIds.length} selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    applySubjectSelection(subjects.map((s) => s.id))
                  }
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => applySubjectSelection([], true)}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100"
                >
                  Clear
                </button>
                {recordedSubjects.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      applySubjectSelection(
                        recordedSubjects.map((rs) => rs.subjectId),
                        true
                      )
                    }
                    className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    Recorded ({recordedSubjects.length})
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {subjects.map((subj) => {
                const checked = selectedSubjectIds.includes(subj.id);
                const rec = recordedSubjectMap.get(subj.id);
                return (
                  <label
                    key={subj.id}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      checked
                        ? "border-indigo-500 bg-indigo-50 text-indigo-900 shadow-2xs"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSubject(subj.id)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <span>
                      {subj.name}{" "}
                      <span className="font-mono text-[11px] opacity-75">
                        ({subj.code})
                      </span>
                    </span>
                    {rec && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 tabular-nums">
                        <CheckCircle2 className="h-3 w-3" />
                        {rec.presentCount}P · {rec.absentCount}A
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {selectedSubjectIds.length === 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Select one or more subjects above to mark exam attendance on{" "}
                {date}.
              </p>
            )}
          </div>
        )}

        {/* Quick Roll Call Actions */}
        {students.length > 0 && selectedSubjectIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {selectedHasRecorded ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Saved on {date}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                  Pending ({date})
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => markAll("PRESENT")}
                className="min-h-[38px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Mark All Present
              </button>
              <button
                type="button"
                onClick={() => markAll("ABSENT")}
                className="min-h-[38px] rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Mark All Absent
              </button>
              {selectedHasRecorded && (
                <button
                  type="button"
                  onClick={clearSelectedExamAttendance}
                  disabled={saving}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear Selected
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Print Header */}
      <div className="mb-3">
        <h2 className="text-base font-bold text-slate-900">
          {selectedClassName} — Exam Attendance ({date})
        </h2>
        <p className="text-xs text-slate-500">
          {examId
            ? `${exams.find((e) => e.id === examId)?.name ?? "Selected Exam"} · `
            : ""}
          Subjects:{" "}
          {selectedSubjectNames.length > 0
            ? selectedSubjectNames.join(", ")
            : "None selected"}
        </p>
      </div>

      {/* Summary KPIs */}
      {!loading && students.length > 0 && selectedSubjectIds.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase">
              Students
            </p>
            <p className="text-base font-bold text-slate-900 tabular-nums sm:text-lg">
              {summary.total}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-emerald-600 uppercase">
              Present
            </p>
            <p className="text-base font-bold text-emerald-700 tabular-nums sm:text-lg">
              {summary.present}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-rose-600 uppercase">
              Absent
            </p>
            <p className="text-base font-bold text-rose-700 tabular-nums sm:text-lg">
              {summary.absent}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-indigo-600 uppercase">
              Attendance Rate
            </p>
            <p className="text-base font-bold text-indigo-700 tabular-nums sm:text-lg">
              {summary.ratePercent}%
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Loading exam attendance...
        </p>
      ) : classes.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          You have no classes assigned yet.
        </p>
      ) : subjects.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          No subjects configured for {selectedClassName}. Assign subjects under
          Academics first.
        </p>
      ) : students.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          No active students enrolled in {selectedClassName}.
        </p>
      ) : (
        <>
          {/* Mobile Roll Call Cards */}
          <div className="space-y-3 md:hidden">
            {filteredStudents.map((s, idx) => {
              const status = statusMap[s.id] ?? "PRESENT";
              const dayBadges = studentRecordedByDate.get(s.id) ?? [];
              const mixed =
                !editedStudentIds.has(s.id) &&
                Boolean(rollCallDerived[s.id]?.hasMixedStatuses);
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
                >
                  <div className="mb-2 flex items-baseline justify-between gap-2">
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
                  {(dayBadges.length > 0 || mixed) && (
                    <div className="mb-2.5 flex flex-wrap gap-1">
                      {dayBadges.map((b) => (
                        <span
                          key={b.subjectId}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            b.status === "PRESENT"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {b.code}: {b.status === "PRESENT" ? "P" : "A"}
                        </span>
                      ))}
                      {mixed && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          Mixed across selected
                        </span>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {(["PRESENT", "ABSENT"] as const).map((st) => {
                      const active = status === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleStudentStatus(s.id, st)}
                          className={`min-h-[42px] rounded-xl border text-xs font-semibold transition ${
                            active
                              ? st === "PRESENT"
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-rose-600 bg-rose-600 text-white"
                              : "border-slate-200 bg-slate-50 text-slate-700"
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
            <div className="no-print sticky bottom-[68px] z-20 rounded-2xl border border-indigo-200 bg-white/95 p-3 shadow-md backdrop-blur-sm">
              <button
                type="button"
                onClick={saveExamAttendance}
                disabled={saving || selectedSubjectIds.length === 0}
                className="min-h-[44px] w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : `Save Exam Attendance (${summary.present}P · ${summary.absent}A)`}
              </button>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2.5 pr-4">#</th>
                  <th className="py-2.5 pr-4">Adm No</th>
                  <th className="py-2.5 pr-4">Student Name</th>
                  <th className="py-2.5 pr-4">Recorded ({date})</th>
                  <th className="py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((s, idx) => {
                  const status = statusMap[s.id] ?? "PRESENT";
                  const dayBadges = studentRecordedByDate.get(s.id) ?? [];
                  const mixed =
                    !editedStudentIds.has(s.id) &&
                    Boolean(rollCallDerived[s.id]?.hasMixedStatuses);
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
                        {dayBadges.length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {dayBadges.map((b) => (
                              <span
                                key={b.subjectId}
                                title={`${b.name}: ${b.status}`}
                                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                  b.status === "PRESENT"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-rose-50 text-rose-700"
                                }`}
                              >
                                {b.code}: {b.status === "PRESENT" ? "P" : "A"}
                              </span>
                            ))}
                            {mixed && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                Mixed
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="inline-flex gap-1.5">
                          {(["PRESENT", "ABSENT"] as const).map((st) => {
                            const active = status === st;
                            const activeStyle =
                              st === "PRESENT"
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-rose-600 bg-rose-600 text-white";
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => handleStudentStatus(s.id, st)}
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
                    </tr>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
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
  );
}

