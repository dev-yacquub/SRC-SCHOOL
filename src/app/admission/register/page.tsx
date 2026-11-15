"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { X } from "lucide-react";

type CreatedResult = {
  student: { id: string; admissionNo: string; fullName: string };
  credentials: { username: string; temporaryPassword: string };
};

export default function RegisterStudentPage() {
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE">("MALE");
  const [dob, setDob] = useState("");
  const [admissionDate, setAdmissionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [photo, setPhoto] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [address, setAddress] = useState("");
  const [previousSchool, setPreviousSchool] = useState("");
  const [usesBus, setUsesBus] = useState(false);
  const [busFee, setBusFee] = useState("");
  const [classId, setClassId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedResult | null>(null);

  useEffect(() => {
    fetch("/api/admin/academics")
      .then((r) => r.json())
      .then((d) => {
        const list = d.classes ?? [];
        setClasses(list);
        if (list.length) setClassId(list[0].id);
        setClassesLoaded(true);
      });
  }, []);

  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) {
      setError("Photo must be under 300 KB.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);
    setSubmitting(true);

    const res = await fetch("/api/admission/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName,
        gender,
        dob,
        admissionDate,
        photo,
        guardianName,
        guardianPhone,
        address,
        previousSchool,
        usesBus,
        busFee: usesBus && busFee.trim() !== "" ? Number(busFee) : null,
        classId,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to register student");
      return;
    }

    setCreated(data);
    setFullName("");
    setDob("");
    setPhoto("");
    setGuardianName("");
    setGuardianPhone("");
    setAddress("");
    setPreviousSchool("");
    setUsesBus(false);
    setBusFee("");
  }

  return (
    <div>
      <PageHeader
        title="Register New Student"
        subtitle="Automatically generates admission number, enrollment record, and student login"
      />

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {classesLoaded && classes.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No classes have been created yet. Ask Admin to set up classes in{" "}
          <strong>Classes & Subjects</strong> before registering students.
        </div>
      )}

      {created && (
        <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-5">
          <h3 className="text-base font-bold text-emerald-900">
            Student Registered: {created.student.fullName}
          </h3>
          <p className="mt-1 text-sm text-emerald-800">
            Admission Number:{" "}
            <strong className="font-mono">{created.student.admissionNo}</strong>
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            Student Login Username:{" "}
            <strong className="font-mono">{created.credentials.username}</strong> ·
            Temporary Password:{" "}
            <strong className="font-mono">
              {created.credentials.temporaryPassword}
            </strong>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/admission/students/${created.student.id}`}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              View Student Profile
            </Link>
            <Link
              href={`/print/student/${created.student.id}`}
              className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              Print Admission Form & ID Card
            </Link>
            <Link
              href="/admission/students"
              className="rounded-lg border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              Go to Student Directory
            </Link>
          </div>
        </div>
      )}

      <Card className="max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Class *
              </label>
              <select
                required
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
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
                Gender *
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as "MALE" | "FEMALE")}
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
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Admission Date
              </label>
              <input
                type="date"
                value={admissionDate}
                onChange={(e) => setAdmissionDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">
              Guardian Information (Contact Only — No Login)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Guardian Name *
                </label>
                <input
                  type="text"
                  required
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Guardian Phone *
                </label>
                <input
                  type="text"
                  required
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value)}
                  placeholder="+252 61 ..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Home Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Previous School
                </label>
                <input
                  type="text"
                  value={previousSchool}
                  onChange={(e) => setPreviousSchool(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">
              School Bus / Transport Service
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={usesBus}
                  onChange={(e) => setUsesBus(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600"
                />
                <span>
                  <strong className="font-semibold text-slate-900">
                    Student uses School Bus
                  </strong>
                  <span className="block text-xs text-slate-500">
                    Automatically adds the Bus Fee item when generating term invoices
                  </span>
                </span>
              </label>

              {usesBus && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Custom Bus Fee Override (optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={busFee}
                    onChange={(e) => setBusFee(e.target.value)}
                    placeholder="Leave blank to use class Bus Fee"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="mb-2 block text-xs font-medium text-slate-700">
              Student Photo (optional, max 300 KB)
            </label>
            <div className="flex flex-wrap items-center gap-4">
              {photo && (
                <div className="relative">
                  <img
                    src={photo}
                    alt="Student preview"
                    className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhoto("")}
                    aria-label="Remove photo"
                    className="absolute -top-2 -right-2 rounded-full bg-slate-800 p-0.5 text-white hover:bg-rose-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoFile}
                className="block text-xs text-slate-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || classes.length === 0}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? "Registering..." : "Register Student"}
          </button>
        </form>
      </Card>
    </div>
  );
}
