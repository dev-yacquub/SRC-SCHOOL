"use client";

import React, { useEffect, useState } from "react";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { Trash2 } from "lucide-react";

type Year = { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean };
type Term = {
  id: string;
  name: string;
  isCurrent: boolean;
  academicYear: { name: string };
};
type SchoolClass = {
  id: string;
  name: string;
  level: number;
  academicYear: { name: string };
  _count: { students: number };
};
type Subject = { id: string; name: string; code: string };
type Teacher = { id: string; fullName: string };
type ClassSubject = {
  id: string;
  class: { id: string; name: string };
  subject: { id: string; name: string; code: string };
  teacher: { id: string; fullName: string };
};

export default function AdminAcademicsPage() {
  const [years, setYears] = useState<Year[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<ClassSubject[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [yearName, setYearName] = useState("2027-2028");
  const [yearStart, setYearStart] = useState("2027-09-01");
  const [yearEnd, setYearEnd] = useState("2028-06-30");

  const [termYearId, setTermYearId] = useState("");
  const [termName, setTermName] = useState("");
  const [termStart, setTermStart] = useState("2026-09-01");
  const [termEnd, setTermEnd] = useState("2026-12-20");

  const [className, setClassName] = useState("");
  const [classLevel, setClassLevel] = useState("1");
  const [classYearId, setClassYearId] = useState("");

  const [subName, setSubName] = useState("");
  const [subCode, setSubCode] = useState("");

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
      setTermYearId((prev) => prev || current.id);
      setClassYearId((prev) => prev || current.id);
    }
    if (data.classes?.length) setAssignClassId((p) => p || data.classes[0].id);
    if (data.subjects?.length) setAssignSubjectId((p) => p || data.subjects[0].id);
    if (data.teachers?.length) setAssignTeacherId((p) => p || data.teachers[0].id);
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

  async function removeItem(kind: string, id: string) {
    setMsg(null);
    const res = await fetch(`/api/admin/academics?kind=${kind}&id=${id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Delete failed" });
      return;
    }
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
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${msg.type === "ok"
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
              await runAction("createYear", {
                data: { name: yearName, startDate: yearStart, endDate: yearEnd },
              });
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
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Add Year
            </button>
          </form>
          <div className="divide-y divide-slate-100">
            {years.map((y) => (
              <div key={y.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium text-slate-900">{y.name}</span>
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
              </div>
            ))}
          </div>
        </Card>

        <Card title="Terms">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await runAction("createTerm", {
                data: {
                  academicYearId: termYearId,
                  name: termName,
                  startDate: termStart,
                  endDate: termEnd,
                },
              });
              if (ok) setTermName("");
            }}
            className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-4"
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
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Add Term
            </button>
          </form>
          <div className="divide-y divide-slate-100">
            {terms.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium text-slate-900">{t.name}</span>{" "}
                  <span className="text-xs text-slate-500">({t.academicYear.name})</span>
                </div>
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
                data: {
                  name: className,
                  level: Number(classLevel),
                  academicYearId: classYearId,
                },
              });
              if (ok) setClassName("");
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
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Add Class
            </button>
          </form>
          <div className="divide-y divide-slate-100">
            {classes.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium text-slate-900">{c.name}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    Level {c.level} · {c._count.students} active students
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem("class", c.id)}
                  className="text-slate-400 hover:text-rose-600"
                  title="Delete class"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Subjects">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await runAction("createSubject", {
                data: { name: subName, code: subCode },
              });
              if (ok) {
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
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Add Subject
            </button>
          </form>
          <div className="divide-y divide-slate-100">
            {subjects.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="font-medium text-slate-900">{s.name}</span>
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">
                    {s.code}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem("subject", s.id)}
                  className="text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
            await runAction("assignClassSubject", {
              data: {
                classId: assignClassId,
                subjectId: assignSubjectId,
                teacherId: assignTeacherId,
              },
            });
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
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Save Assignment
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
              <tr>
                <th className="py-2 pr-4">Class</th>
                <th className="py-2 pr-4">Subject</th>
                <th className="py-2 pr-4">Teacher</th>
                <th className="py-2 text-right">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="py-2.5 pr-4 font-medium text-slate-900">{a.class.name}</td>
                  <td className="py-2.5 pr-4 text-slate-700">
                    {a.subject.name} ({a.subject.code})
                  </td>
                  <td className="py-2.5 pr-4 text-slate-700">{a.teacher.fullName}</td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => removeItem("classSubject", a.id)}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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

