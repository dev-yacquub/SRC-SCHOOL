"use client";

import React, { useEffect, useState } from "react";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { Pencil, Trash2 } from "lucide-react";

type Year = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
};
type Term = {
  id: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  academicYear: { name: string } | null;
};
type SchoolClass = {
  id: string;
  name: string;
  level: number;
  academicYearId: string;
  academicYear: { name: string } | null;
  _count: { students: number };
};
type Subject = { id: string; name: string; code: string };
type Teacher = { id: string; fullName: string };
type ClassSubject = {
  id: string;
  class: { id: string; name: string } | null;
  subject: { id: string; name: string; code: string } | null;
  teacher: { id: string; fullName: string } | null;
};

export default function AdminAcademicsPage() {
  const [years, setYears] = useState<Year[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<ClassSubject[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [editingYearId, setEditingYearId] = useState<string | null>(null);
  const [yearName, setYearName] = useState("2027-2028");
  const [yearStart, setYearStart] = useState("2027-09-01");
  const [yearEnd, setYearEnd] = useState("2028-06-30");

  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [termYearId, setTermYearId] = useState("");
  const [termName, setTermName] = useState("");
  const [termStart, setTermStart] = useState("2026-09-01");
  const [termEnd, setTermEnd] = useState("2026-12-20");

  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [className, setClassName] = useState("");
  const [classLevel, setClassLevel] = useState("1");
  const [classYearId, setClassYearId] = useState("");

  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [subName, setSubName] = useState("");
  const [subCode, setSubCode] = useState("");

  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [assignClassId, setAssignClassId] = useState("");
  const [assignSubjectId, setAssignSubjectId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");

  async function loadAll() {
    const res = await fetch("/api/admin/academics");
    if (!res.ok) return;
    const data = await res.json();
    setYears(data.years ?? []);
    setTerms(data.terms ?? []);
    setClasses(data.classes ?? []);
    setSubjects(data.subjects ?? []);
    setTeachers(data.teachers ?? []);
    setAssignments(data.classSubjects ?? []);

    if (data.years?.length) {
      const current = data.years.find((y: Year) => y.isCurrent) ?? data.years[0];
      setTermYearId((prev) =>
        data.years.some((y: Year) => y.id === prev) ? prev : current.id
      );
      setClassYearId((prev) =>
        data.years.some((y: Year) => y.id === prev) ? prev : current.id
      );
    } else {
      setTermYearId("");
      setClassYearId("");
    }
    if (data.classes?.length) {
      setAssignClassId((prev) =>
        data.classes.some((c: SchoolClass) => c.id === prev)
          ? prev
          : data.classes[0].id
      );
    } else {
      setAssignClassId("");
    }
    if (data.subjects?.length) {
      setAssignSubjectId((prev) =>
        data.subjects.some((s: Subject) => s.id === prev)
          ? prev
          : data.subjects[0].id
      );
    } else {
      setAssignSubjectId("");
    }
    if (data.teachers?.length) {
      setAssignTeacherId((prev) =>
        data.teachers.some((t: Teacher) => t.id === prev)
          ? prev
          : data.teachers[0].id
      );
    } else {
      setAssignTeacherId("");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function runAction(action: string, payload: Record<string, unknown>) {
    setMsg(null);
    const res = await fetch("/api/admin/academics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Operation failed" });
      return false;
    }
    setMsg({ type: "ok", text: "Saved successfully." });
    await loadAll();
    return true;
  }

  async function removeItem(kind: string, id: string, label?: string) {
    if (
      !window.confirm(
        `Are you sure you want to delete ${label ? `"${label}"` : "this item"}?`
      )
    ) {
      return;
    }
    setMsg(null);
    const res = await fetch(`/api/admin/academics?kind=${kind}&id=${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Delete failed" });
      return;
    }
    setMsg({ type: "ok", text: "Deleted successfully." });
    await loadAll();
  }

  return (
    <div>
      <PageHeader
        title="Classes, Subjects & Academic Structure"
        subtitle="Configure academic years, terms, classes, subjects, and teacher assignments"
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

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Academic Years">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await runAction("createYear", {
                ...(editingYearId ? { id: editingYearId } : {}),
                data: { name: yearName, startDate: yearStart, endDate: yearEnd },
              });
              if (ok) {
                setEditingYearId(null);
                setYearName("2027-2028");
              }
            }}
            className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-4"
          >
            <input
              type="text"
              required
              value={yearName}
              onChange={(e) => setYearName(e.target.value)}
              placeholder="2027-2028"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="date"
              required
              value={yearStart}
              onChange={(e) => setYearStart(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              type="date"
              required
              value={yearEnd}
              onChange={(e) => setYearEnd(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <div className="flex gap-1.5">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {editingYearId ? "Update" : "Add Year"}
              </button>
              {editingYearId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingYearId(null);
                    setYearName("2027-2028");
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          <div className="divide-y divide-slate-100">
            {years.map((y) => (
              <div
                key={y.id}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <div>
                  <span className="font-medium text-slate-900">{y.name}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    ({y.startDate?.slice(0, 10)} → {y.endDate?.slice(0, 10)})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {y.isCurrent ? (
                    <StatusBadge value="ACTIVE" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => runAction("setCurrentYear", { id: y.id })}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Set Current
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingYearId(y.id);
                      setYearName(y.name);
                      setYearStart(y.startDate ? y.startDate.slice(0, 10) : "");
                      setYearEnd(y.endDate ? y.endDate.slice(0, 10) : "");
                    }}
                    className="text-slate-400 hover:text-indigo-600"
                    title="Edit year"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem("year", y.id, y.name)}
                    className="text-slate-400 hover:text-rose-600"
                    title="Delete year"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Terms">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await runAction("createTerm", {
                ...(editingTermId ? { id: editingTermId } : {}),
                data: {
                  academicYearId: termYearId,
                  name: termName,
                  startDate: termStart,
                  endDate: termEnd,
                },
              });
              if (ok) {
                setEditingTermId(null);
                setTermName("");
              }
            }}
            className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-5"
          >
            <select
              value={termYearId}
              onChange={(e) => setTermYearId(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              value={termName}
              onChange={(e) => setTermName(e.target.value)}
              placeholder="Term name"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="date"
              required
              value={termStart}
              onChange={(e) => setTermStart(e.target.value)}
              title="Start date"
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              type="date"
              required
              value={termEnd}
              onChange={(e) => setTermEnd(e.target.value)}
              title="End date"
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <div className="flex gap-1.5">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {editingTermId ? "Update" : "Add Term"}
              </button>
              {editingTermId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingTermId(null);
                    setTermName("");
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          <div className="divide-y divide-slate-100">
            {terms.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <div>
                  <span className="font-medium text-slate-900">{t.name}</span>{" "}
                  <span className="text-xs text-slate-500">
                    ({t.academicYear?.name ?? "Unassigned Year"})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {t.isCurrent ? (
                    <StatusBadge value="ACTIVE" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => runAction("setCurrentTerm", { id: t.id })}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Set Current
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTermId(t.id);
                      setTermYearId(t.academicYearId);
                      setTermName(t.name);
                      setTermStart(t.startDate ? t.startDate.slice(0, 10) : "");
                      setTermEnd(t.endDate ? t.endDate.slice(0, 10) : "");
                    }}
                    className="text-slate-400 hover:text-indigo-600"
                    title="Edit term"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem("term", t.id, t.name)}
                    className="text-slate-400 hover:text-rose-600"
                    title="Delete term"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Classes">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await runAction("createClass", {
                ...(editingClassId ? { id: editingClassId } : {}),
                data: {
                  name: className,
                  level: Number(classLevel),
                  academicYearId: classYearId,
                },
              });
              if (ok) {
                setEditingClassId(null);
                setClassName("");
              }
            }}
            className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-4"
          >
            <input
              type="text"
              required
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g. Grade 3A"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="number"
              min={1}
              max={15}
              required
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value)}
              placeholder="Level"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <select
              value={classYearId}
              onChange={(e) => setClassYearId(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {editingClassId ? "Update" : "Add Class"}
              </button>
              {editingClassId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingClassId(null);
                    setClassName("");
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          <div className="divide-y divide-slate-100">
            {classes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <div>
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    Level {c.level} · {c._count?.students ?? 0} active students
                    {c.academicYear?.name ? ` · ${c.academicYear.name}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingClassId(c.id);
                      setClassName(c.name);
                      setClassLevel(String(c.level));
                      setClassYearId(c.academicYearId);
                    }}
                    className="text-slate-400 hover:text-indigo-600"
                    title="Edit class"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem("class", c.id, c.name)}
                    className="text-slate-400 hover:text-rose-600"
                    title="Delete class"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Subjects">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await runAction("createSubject", {
                ...(editingSubjectId ? { id: editingSubjectId } : {}),
                data: { name: subName, code: subCode },
              });
              if (ok) {
                setEditingSubjectId(null);
                setSubName("");
                setSubCode("");
              }
            }}
            className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3"
          >
            <input
              type="text"
              required
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="e.g. Biology"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="text"
              required
              value={subCode}
              onChange={(e) => setSubCode(e.target.value)}
              placeholder="Code (BIO)"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm uppercase"
            />
            <div className="flex gap-1.5">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {editingSubjectId ? "Update" : "Add Subject"}
              </button>
              {editingSubjectId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSubjectId(null);
                    setSubName("");
                    setSubCode("");
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          <div className="divide-y divide-slate-100">
            {subjects.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <div>
                  <span className="font-medium text-slate-900">{s.name}</span>
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                    {s.code}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSubjectId(s.id);
                      setSubName(s.name);
                      setSubCode(s.code);
                    }}
                    className="text-slate-400 hover:text-indigo-600"
                    title="Edit subject"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem("subject", s.id, s.name)}
                    className="text-slate-400 hover:text-rose-600"
                    title="Delete subject"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="Assign Teachers to Class & Subject"
        subtitle="Teachers only see classes and subjects assigned here"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await runAction("assignClassSubject", {
              ...(editingAssignmentId ? { id: editingAssignmentId } : {}),
              data: {
                classId: assignClassId,
                subjectId: assignSubjectId,
                teacherId: assignTeacherId,
              },
            });
            if (ok) setEditingAssignmentId(null);
          }}
          className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-4"
        >
          <select
            value={assignClassId}
            onChange={(e) => setAssignClassId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={assignSubjectId}
            onChange={(e) => setAssignSubjectId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          <select
            value={assignTeacherId}
            onChange={(e) => setAssignTeacherId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {editingAssignmentId ? "Update Assignment" : "Save Assignment"}
            </button>
            {editingAssignmentId && (
              <button
                type="button"
                onClick={() => setEditingAssignmentId(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
              <tr>
                <th className="py-2 pr-4">Class</th>
                <th className="py-2 pr-4">Subject</th>
                <th className="py-2 pr-4">Teacher</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="py-2.5 pr-4 font-medium text-slate-900">
                    {a.class?.name ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-700">
                    {a.subject ? `${a.subject.name} (${a.subject.code})` : "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-700">
                    {a.teacher?.fullName ?? "—"}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAssignmentId(a.id);
                          if (a.class?.id) setAssignClassId(a.class.id);
                          if (a.subject?.id) setAssignSubjectId(a.subject.id);
                          if (a.teacher?.id) setAssignTeacherId(a.teacher.id);
                        }}
                        className="text-slate-400 hover:text-indigo-600"
                        title="Edit assignment"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          removeItem(
                            "classSubject",
                            a.id,
                            `${a.class?.name ?? "Class"} - ${a.subject?.name ?? "Subject"}`
                          )
                        }
                        className="text-slate-400 hover:text-rose-600"
                        title="Delete assignment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
