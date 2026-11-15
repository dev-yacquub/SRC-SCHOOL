"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ArrowLeft } from "lucide-react";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update password");
        setLoading(false);
        return;
      }
      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1000);
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Change Password</h1>
            <p className="text-xs text-slate-500">
              Update your account login password
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
            Password updated! Redirecting...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              New Password (min 6 chars)
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}

