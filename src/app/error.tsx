"use client";

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isFirebaseSetupError =
    error.message.includes("Firestore") ||
    error.message.includes("src-tech-school") ||
    error.message.includes("client is offline") ||
    error.message.includes("PERMISSION_DENIED");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-wider text-rose-600 uppercase">
          {isFirebaseSetupError ? "Firebase Connection Required" : "Application Error"}
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">
          {isFirebaseSetupError
            ? "Could not connect to Cloud Firestore"
            : "Something went wrong"}
        </h1>
        <p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs break-words text-slate-700">
          {error.message}
        </p>

        {isFirebaseSetupError && (
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-xs text-slate-600">
            <li>
              Enable Cloud Firestore API and create the Firestore database in Firebase Console
              for project <code className="font-mono font-semibold">src-tech-school</code>.
            </li>
            <li>
              In <code className="font-mono">.env</code>, set{" "}
              <code className="font-mono">FIREBASE_SERVICE_ACCOUNT_KEY</code> (recommended), or
              temporarily set Firestore to Test Mode during local development.
            </li>
            <li>
              Run <code className="font-mono">npm run db:seed</code> (or{" "}
              <code className="font-mono">npm run db:migrate:firebase</code>) to populate data.
            </li>
          </ol>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Try Again
          </button>
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Check /api/health
          </a>
        </div>
      </div>
    </div>
  );
}

