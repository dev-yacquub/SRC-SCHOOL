"use client";

import React, { useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { DAYS_OF_WEEK } from "@/lib/domain";
import { Pencil, Trash2 } from "lucide-react";

type Slot = {
  id: string;
  dayOfWeek: number;
  period: number;
  startTime: string;
  endTime: string;
  classSubject: {
    id: string;
    class: { id: string; name: string };
    subject: { name: string; code: string };
    teacher: { fullName: string };
  };
};

type ClassSubject = {
  id: string;
  class: { id: string; name: string };
  subject: { name: string; code: string };
  teacher: { fullName: string };
};

export default function AdminTimetablePage() {
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [classSubjectId, setClassSubjectId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("6");
  const [period, setPeriod] = useState("1");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("08:45");

  async function loadAcademics() {
    const res = await fetch("/api/admin/academics");
    if (!res.ok) return;
    const data = await res.json();
    setClasses(data.classes ?? []);
    setClassSubjects(data.classSubjects ?? []);
    if (data.classes?.length) {
      setSelectedClassId((prev) => prev || data.classes[0].id);
    }
  }

  async function loadSlots(cid: string) {
    if (!cid) return;
    const res = await fetch(`/api/admin/timetable?classId=${cid}`);
    if (res.ok) {
      const data = await res.json();
      setSlots(data.slots ?? []);
    }
  }

  useEffect(() => {
    loadAcademics();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      loadSlots(selectedClassId);
      const firstForClass = classSubjects.find(
        (cs) => cs.class?.id === selectedClassId
      );
      setClassSubjectId(firstForClass?.id ?? "");
    }
  }, [selectedClassId, classSubjects]);

  const classAssignments = classSubjects.filter(
    (cs) => cs.class?.id === selectedClassId && cs.subject && cs.teacher
  );

  async function handleAddSlot(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/admin/timetable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(editingSlotId ? { id: editingSlotId } : {}),
        classSubjectId,
        dayOfWeek: Number(dayOfWeek),
        period: Number(period),
        startTime,
        endTime,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "Conflict or invalid slot" });
      return;
    }
    setMsg({
      type: "ok",
      text: editingSlotId ? "Timetable period updated." : "Timetable period added.",
    });
    setEditingSlotId(null);
    loadSlots(selectedClassId);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this timetable period slot?")) return;
    await fetch(`/api/admin/timetable?id=${id}`, { method: "DELETE" });
    if (editingSlotId === id) setEditingSlotId(null);
    loadSlots(selectedClassId);
  }

  const periods = [1, 2, 3, 4, 5, 6];

  return (
    <div>
      <PageHeader
        title="Weekly Timetable"
        subtitle="Schedule class periods with automatic class & teacher conflict detection"
        action={
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        }
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

      <Card title="Add Period Slot" className="mb-6">
        {classAssignments.length === 0 ? (
          <p className="text-sm text-slate-500">
            No subjects assigned to this class yet. Assign subjects in Classes &
            Subjects first.
          </p>
        ) : (
          <form
            onSubmit={handleAddSlot}
            className="grid grid-cols-1 gap-3 sm:grid-cols-6"
          >
            <select
              value={classSubjectId}
              onChange={(e) => setClassSubjectId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
            >
              {classAssignments.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  {cs.subject.name} — {cs.teacher.fullName}
                </option>
              ))}
            </select>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {periods.map((p) => (
                <option key={p} value={p}>
                  Period {p}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs"
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs"
              />
            </div>
            <div className="flex gap-1.5">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                {editingSlotId ? "Update Slot" : "Add Slot"}
              </button>
              {editingSlotId && (
                <button
                  type="button"
                  onClick={() => setEditingSlotId(null)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </Card>

      <Card title="Class Weekly Schedule">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase">
                <th className="p-3">Period</th>
                {DAYS_OF_WEEK.map((d) => (
                  <th key={d.value} className="p-3">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {periods.map((p) => (
                <tr key={p}>
                  <td className="p-3 font-semibold text-slate-700">Period {p}</td>
                  {DAYS_OF_WEEK.map((d) => {
                    const slot = slots.find(
                      (s) => s.dayOfWeek === d.value && s.period === p
                    );
                    return (
                      <td key={d.value} className="p-2 align-top">
                        {slot ? (
                          <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-2">
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-semibold text-indigo-950">
                                {slot.classSubject?.subject?.name ?? "—"}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSlotId(slot.id);
                                    if (slot.classSubject?.id) {
                                      setClassSubjectId(slot.classSubject.id);
                                    }
                                    setDayOfWeek(String(slot.dayOfWeek));
                                    setPeriod(String(slot.period));
                                    setStartTime(slot.startTime);
                                    setEndTime(slot.endTime);
                                  }}
                                  className="text-slate-400 hover:text-indigo-600"
                                  title="Edit slot"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(slot.id)}
                                  className="text-slate-400 hover:text-rose-600"
                                  title="Delete slot"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            <p className="mt-0.5 text-[11px] text-indigo-800">
                              {slot.classSubject?.teacher?.fullName ?? "—"}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-500 tabular-nums">
                              {slot.startTime}–{slot.endTime}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

