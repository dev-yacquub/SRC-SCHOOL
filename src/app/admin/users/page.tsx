"use client";

import React, { useEffect, useState } from "react";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { Plus, KeyRound, Pencil, X } from "lucide-react";

type StaffUser = {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  role: "ADMIN" | "ADMISSION" | "TEACHER" | "ACCOUNTANT" | "STUDENT";
  isActive: boolean;
  lastLoginAt: string | null;
  teacherProfile: { phone: string | null; qualification: string | null } | null;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [includeStudents, setIncludeStudents] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"TEACHER" | "ADMISSION" | "ACCOUNTANT" | "ADMIN">(
    "TEACHER"
  );
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [qualification, setQualification] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editing, setEditing] = useState<{
    id: string;
    username: string;
    fullName: string;
    email: string;
    role: StaffUser["role"];
    phone: string;
    qualification: string;
  } | null>(null);

  async function loadUsers(showStudents = includeStudents) {
    setLoading(true);
    const res = await fetch(
      `/api/admin/users${showStudents ? "?includeStudents=true" : ""}`
    );
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadUsers(includeStudents);
  }, [includeStudents]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        fullName,
        email,
        role,
        password,
        phone,
        qualification,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "Failed to create user" });
      return;
    }
    setUsername("");
    setFullName("");
    setEmail("");
    setPassword("");
    setPhone("");
    setQualification("");
    setMessage({ type: "ok", text: "User created successfully." });
    loadUsers();
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setMessage(null);
    const res = await fetch(`/api/admin/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: editing.fullName,
        email: editing.email,
        role: editing.role,
        phone: editing.phone,
        qualification: editing.qualification,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "Failed to update user" });
      return;
    }
    setEditing(null);
    setMessage({ type: "ok", text: "User updated successfully." });
    loadUsers();
  }

  async function toggleActive(u: StaffUser) {
    setMessage(null);
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "Failed to update status" });
      return;
    }
    loadUsers();
  }

  async function resetPassword(u: StaffUser) {
    const newPass = window.prompt(
      `Enter a new temporary password for ${u.fullName} (min 6 chars):`,
      ""
    );
    if (!newPass) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetPassword: newPass }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "Reset failed" });
      return;
    }
    setMessage({
      type: "ok",
      text: `Password reset for @${u.username}.`,
    });
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle="Create, edit, reset passwords, and activate/deactivate accounts across all roles"
        action={
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={includeStudents}
              onChange={(e) => setIncludeStudents(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Include Student Logins
          </label>
        }
      />

      {message && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Add Staff Account" className="lg:col-span-1">
          <form onSubmit={handleCreate} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. teacher.ali"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Email (optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="TEACHER">Teacher</option>
                <option value="ADMISSION">Admission Officer</option>
                <option value="ACCOUNTANT">Accountant</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            {role === "TEACHER" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Qualification
                  </label>
                  <input
                    type="text"
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    placeholder="e.g. B.Ed Mathematics"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Initial Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {submitting ? "Creating..." : "Create User"}
            </button>
          </form>
        </Card>

        <Card title={`Accounts (${users.length})`} className="lg:col-span-2">
          {loading ? (
            <p className="text-sm text-slate-500">Loading users...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2.5 pr-4">Name</th>
                    <th className="py-2.5 pr-4">Username</th>
                    <th className="py-2.5 pr-4">Role</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900">{u.fullName}</p>
                        {u.teacherProfile?.qualification && (
                          <p className="text-xs text-slate-500">
                            {u.teacherProfile.qualification}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">@{u.username}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge value={u.isActive ? "ACTIVE" : "INACTIVE"} />
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                id: u.id,
                                username: u.username,
                                fullName: u.fullName,
                                email: u.email ?? "",
                                role: u.role,
                                phone: u.teacherProfile?.phone ?? "",
                                qualification: u.teacherProfile?.qualification ?? "",
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => resetPassword(u)}
                            title="Reset password"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <KeyRound className="h-3 w-3" />
                            Reset
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(u)}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                              u.isActive
                                ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                          >
                            {u.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                Edit User (@{editing.username})
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-3">
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
                  Email
                </label>
                <input
                  type="email"
                  value={editing.email}
                  onChange={(e) =>
                    setEditing({ ...editing, email: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              {editing.role !== "STUDENT" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Role
                  </label>
                  <select
                    value={editing.role}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        role: e.target.value as StaffUser["role"],
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="ADMISSION">Admission Officer</option>
                    <option value="TEACHER">Teacher</option>
                    <option value="ACCOUNTANT">Accountant</option>
                  </select>
                </div>
              )}
              {editing.role === "TEACHER" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Phone
                    </label>
                    <input
                      type="text"
                      value={editing.phone}
                      onChange={(e) =>
                        setEditing({ ...editing, phone: e.target.value })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Qualification
                    </label>
                    <input
                      type="text"
                      value={editing.qualification}
                      onChange={(e) =>
                        setEditing({ ...editing, qualification: e.target.value })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </>
              )}
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
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
