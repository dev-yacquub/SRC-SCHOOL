"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { Search, Pencil, Printer, X, Download, Eye, Users } from "lucide-react";

type StudentRow = {
  id: string;
  admissionNo: string;
  fullName: string;
  gender: "MALE" | "FEMALE";
  dob: string | null;
  photo: string | null;
  guardianName: string;
  guardianPhone: string;
  address: string | null;
  previousSchool: string | null;
  admissionDate: string;
  status: "ACTIVE" | "TRANSFERRED" | "WITHDRAWN" | "GRADUATED";
  statusReason: string | null;
  classId: string;
  class: { id: string; name: string };
  user: { username: string; isActive: boolean };
};

export default function AdmissionStudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (classFilter) params.set("classId", classFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (genderFilter) params.set("gender", genderFilter);
    params.set("page", String(page));
    params.set("limit", "20");

    const res = await fetch(`/api/admission/students?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setStudents(data.students ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    }
    setLoading(false);
  }, [q, classFilter, statusFilter, genderFilter, page]);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const cid = sp.get("classId");
    if (cid) setClassFilter(cid);

    fetch("/api/admin/academics")
      .then((r) => r.json())
      .then((d) => setClasses(d.classes ?? []));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQ(searchInput);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  function openEditModal(s: StudentRow) {
    setEditError(null);
    setEditing({
      ...s,
      dob: s.dob ? s.dob.slice(0, 10) : "",
      admissionDate: s.admissionDate ? s.admissionDate.slice(0, 10) : "",
    });
  }

  function handleEditPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    if (file.size > 300 * 1024) {
      setEditError("Photo must be under 300 KB.");
      return;
    }
    setEditError(null);
    const reader = new FileReader();
    reader.onload = () =>
      setEditing((prev) => (prev ? { ...prev, photo: String(reader.result ?? "") } : prev));
    reader.readAsDataURL(file);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditError(null);
    setSaving(true);
    const res = await fetch(`/api/admission/students/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: editing.fullName,
        gender: editing.gender,
        dob: editing.dob ?? "",
        admissionDate: editing.admissionDate ?? "",
        photo: editing.photo ?? "",
        guardianName: editing.guardianName,
        guardianPhone: editing.guardianPhone,
        address: editing.address ?? "",
        previousSchool: editing.previousSchool ?? "",
        classId: editing.classId,
        status: editing.status,
        statusReason: editing.statusReason ?? "",
      }),
    });
    const out = await res.json();
    setSaving(false);
    if (!res.ok) {
      setEditError(out.error ?? "Failed to update student");
      return;
    }
    setEditing(null);
    setMsg(`Updated record for ${editing.fullName}.`);
    loadStudents();
  }

  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  if (classFilter) exportParams.set("classId", classFilter);
  if (statusFilter) exportParams.set("status", statusFilter);
  if (genderFilter) exportParams.set("gender", genderFilter);

  const hasFilters = Boolean(searchInput || classFilter || statusFilter || genderFilter);

  return (
    <div>
      <PageHeader
        title="Student Directory"
        subtitle="Search, view 360° profile, edit details, export Excel, and print ID cards"
        action={
          <>
            <a
              href={`/api/admission/export?${exportParams.toString()}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Export Excel
            </a>
            <Link
              href={
                classFilter
                  ? `/print/id-cards?classId=${classFilter}`
                  : "/print/id-cards"
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Users className="h-4 w-4" />
              Print Class ID Cards
            </Link>
            <Link
              href="/admission/register"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Register Student
            </Link>
          </>
        }
      />

      {msg && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {msg}
        </div>
      )}

      <Card className="mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQ(searchInput);
          }}
          className="grid gap-3 sm:grid-cols-6"
        >
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, Adm No, guardian..."
              className="w-full rounded-lg border border-slate-300 py-2 pr-3 pl-9 text-sm"
            />
          </div>
          <select
            value={classFilter}
            onChange={(e) => {
              setPage(1);
              setClassFilter(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="TRANSFERRED">Transferred</option>
            <option value="WITHDRAWN">Withdrawn</option>
            <option value="GRADUATED">Graduated</option>
          </select>
          <select
            value={genderFilter}
            onChange={(e) => {
              setPage(1);
              setGenderFilter(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Genders</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Search
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setQ("");
                  setClassFilter("");
                  setStatusFilter("");
                  setGenderFilter("");
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card
        title={`Students (${total})`}
        subtitle={`Showing page ${page} of ${totalPages}`}
      >
        {loading ? (
          <p className="text-sm text-slate-500">Loading students...</p>
        ) : students.length === 0 ? (
          <p className="text-sm text-slate-500">No students match the selected filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2.5 pr-4">Adm No.</th>
                    <th className="py-2.5 pr-4">Student</th>
                    <th className="py-2.5 pr-4">Class</th>
                    <th className="py-2.5 pr-4">Guardian</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-600">
                        {s.admissionNo}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          {s.photo ? (
                            <img
                              src={s.photo}
                              alt={s.fullName}
                              className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                              {s.fullName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <Link
                              href={`/admission/students/${s.id}`}
                              className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                            >
                              {s.fullName}
                            </Link>
                            <p className="text-xs text-slate-500">
                              @{s.user.username} · {s.gender}
                              {!s.user.isActive && (
                                <span className="ml-1.5 text-rose-600">· Login disabled</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{s.class.name}</td>
                      <td className="py-3 pr-4">
                        <p className="text-slate-800">{s.guardianName}</p>
                        <p className="text-xs text-slate-500">{s.guardianPhone}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge value={s.status} />
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            href={`/admission/students/${s.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="h-3 w-3" />
                            Profile
                          </Link>
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                          <Link
                            href={`/print/student/${s.id}`}
                            className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                          >
                            <Printer className="h-3 w-3" />
                            Docs
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-600">
                <span>
                  Page {page} of {totalPages} ({total} total students)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-md border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-md border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
          <div className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                Edit Student ({editing.admissionNo})
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {editError && (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {editError}
              </div>
            )}
            <form onSubmit={saveEdit} className="space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editing.fullName}
                    onChange={(e) =>
                      setEditing({ ...editing, fullName: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Gender
                  </label>
                  <select
                    value={editing.gender}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        gender: e.target.value as "MALE" | "FEMALE",
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={editing.dob ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, dob: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Admission Date
                  </label>
                  <input
                    type="date"
                    value={editing.admissionDate ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, admissionDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Class
                  </label>
                  <select
                    value={editing.classId}
                    onChange={(e) =>
                      setEditing({ ...editing, classId: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Status
                  </label>
                  <select
                    value={editing.status}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        status: e.target.value as StudentRow["status"],
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="TRANSFERRED">TRANSFERRED</option>
                    <option value="WITHDRAWN">WITHDRAWN</option>
                    <option value="GRADUATED">GRADUATED</option>
                  </select>
                </div>
              </div>

              {editing.status !== "ACTIVE" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Transfer / Withdrawal / Graduation Note (prints on certificate)
                  </label>
                  <input
                    type="text"
                    value={editing.statusReason ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, statusReason: e.target.value })
                    }
                    placeholder="e.g. Family relocated to Hargeisa / Completed Grade 8"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Guardian Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editing.guardianName}
                    onChange={(e) =>
                      setEditing({ ...editing, guardianName: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Guardian Phone
                  </label>
                  <input
                    type="text"
                    required
                    value={editing.guardianPhone}
                    onChange={(e) =>
                      setEditing({ ...editing, guardianPhone: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Address
                  </label>
                  <input
                    type="text"
                    value={editing.address ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, address: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Previous School
                  </label>
                  <input
                    type="text"
                    value={editing.previousSchool ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, previousSchool: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Student Photo (max 300 KB)
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {editing.photo && (
                    <div className="relative">
                      <img
                        src={editing.photo}
                        alt={editing.fullName}
                        className="h-14 w-14 rounded-lg border border-slate-200 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setEditing({ ...editing, photo: "" })}
                        className="absolute -top-2 -right-2 rounded-full bg-slate-800 p-0.5 text-white hover:bg-rose-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEditPhoto}
                    className="block text-xs text-slate-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
