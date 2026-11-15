"use client";

import React, { useState } from "react";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";

export function StudentAccountActions({
  studentId,
  username,
  initialActive,
  mustChangePassword,
}: {
  studentId: string;
  username: string;
  initialActive: boolean;
  mustChangePassword: boolean;
}) {
  const [isActive, setIsActive] = useState(initialActive);
  const [mustChange, setMustChange] = useState(mustChangePassword);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  async function toggleLogin() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/admission/students/${studentId}/account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggleActive", isActive: !isActive }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "Failed" });
      return;
    }
    setIsActive(Boolean(data.isActive));
    setMessage({
      type: "ok",
      text: data.isActive
        ? `Portal login enabled for @${username}.`
        : `Portal login disabled for @${username}.`,
    });
  }

  async function resetPassword() {
    const custom = window.prompt(
      `Reset password for @${username}.\nEnter new temporary password (leave blank for default "Student123!"):`,
      "Student123!"
    );
    if (custom === null) return;
    if (custom && custom.trim().length > 0 && custom.trim().length < 6) {
      setMessage({ type: "err", text: "Password must be at least 6 characters." });
      return;
    }

    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/admission/students/${studentId}/account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resetPassword",
        newPassword: custom.trim() || "Student123!",
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "Failed to reset password" });
      return;
    }
    setMustChange(true);
    setMessage({
      type: "ok",
      text: `Password reset! Temporary password: ${data.temporaryPassword} (student must change on next login).`,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div>
          <p className="text-xs text-slate-500">Username</p>
          <p className="font-mono font-semibold text-slate-900">@{username}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Portal Access</p>
          <p
            className={`text-xs font-semibold ${
              isActive ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {isActive ? "Active" : "Disabled"}
            {mustChange ? " · Must change password" : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={resetPassword}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <KeyRound className="h-3.5 w-3.5" />
          Reset Student Password
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={toggleLogin}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
            isActive
              ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          {isActive ? (
            <>
              <ShieldOff className="h-3.5 w-3.5" />
              Disable Login
            </>
          ) : (
            <>
              <ShieldCheck className="h-3.5 w-3.5" />
              Enable Login
            </>
          )}
        </button>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

