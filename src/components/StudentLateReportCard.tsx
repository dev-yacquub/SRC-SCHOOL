import React from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import {
  formatShiftLabel,
  getLateArrivalStats,
  LATE_DAYS_HIGHLIGHT_THRESHOLD,
} from "@/lib/domain";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

export type StudentLateArrivalRecord = {
  id: string;
  date: string;
  shift: string;
  note: string | null;
  punishedAt: Date | string | null;
};

type StudentLateReportCardProps = {
  records: StudentLateArrivalRecord[];
  showManageLink?: boolean;
  maxRows?: number;
  className?: string;
};

export function StudentLateReportCard({
  records,
  showManageLink = false,
  maxRows = 20,
  className = "",
}: StudentLateReportCardProps) {
  const stats = getLateArrivalStats(records);
  const visibleRecords = records.slice(0, maxRows);

  return (
    <Card
      title="Late Arrivals Report"
      subtitle={
        stats.totalLateShifts > 0
          ? `${stats.totalLateDays} late ${stats.totalLateDays === 1 ? "day" : "days"} (${stats.totalLateShifts} ${stats.totalLateShifts === 1 ? "shift" : "shifts"}) · ${stats.unpunishedLateDays} unpunished`
          : "Punctuality and late arrival history"
      }
      action={
        showManageLink ? (
          <Link
            href="/admission/late"
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            Manage Late Students →
          </Link>
        ) : undefined
      }
      className={className}
    >
      {/* Late Summary Strip */}
      <div
        className={`mb-4 grid grid-cols-1 gap-2.5 rounded-xl border p-3 sm:grid-cols-3 ${
          stats.needsPunishmentHighlight
            ? "border-rose-200 bg-rose-50/80"
            : stats.unpunishedLateDays > 0
              ? "border-amber-200 bg-amber-50/70"
              : "border-slate-100 bg-slate-50/70"
        }`}
      >
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase">
            Total Late
          </p>
          <p className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">
            {stats.totalLateDays}{" "}
            <span className="text-xs font-medium text-slate-500">
              {stats.totalLateDays === 1 ? "day" : "days"} ({stats.totalLateShifts}s)
            </span>
          </p>
        </div>

        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase">
            Unpunished
          </p>
          <p
            className={`mt-0.5 text-base font-bold tabular-nums ${
              stats.needsPunishmentHighlight
                ? "text-rose-700"
                : stats.unpunishedLateDays > 0
                  ? "text-amber-700"
                  : "text-emerald-700"
            }`}
          >
            {stats.unpunishedLateDays}{" "}
            <span className="text-xs font-medium opacity-80">
              {stats.unpunishedLateDays === 1 ? "day" : "days"} (
              {stats.unpunishedLateShifts}s)
            </span>
          </p>
        </div>

        <div className="flex items-center sm:justify-end">
          {stats.needsPunishmentHighlight ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 ring-1 ring-rose-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Action Needed ({LATE_DAYS_HIGHLIGHT_THRESHOLD}+ days)
            </span>
          ) : stats.unpunishedLateDays > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-300">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Pending ({stats.unpunishedLateDays}/{LATE_DAYS_HIGHLIGHT_THRESHOLD})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              {stats.totalLateDays > 0 ? "Cleared / Punished" : "Good Standing"}
            </span>
          )}
        </div>
      </div>

      {/* Records List */}
      {records.length === 0 ? (
        <p className="text-sm text-slate-500">
          No late arrivals recorded for this student.
        </p>
      ) : (
        <>
          <div className="divide-y divide-slate-100">
            {visibleRecords.map((rec) => {
              const punishedDate = rec.punishedAt
                ? new Date(rec.punishedAt).toLocaleDateString()
                : null;
              return (
                <div
                  key={rec.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {rec.date}
                      </span>
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                        {formatShiftLabel(rec.shift)}
                      </span>
                      {rec.note && (
                        <span className="truncate text-xs text-slate-600">
                          — {rec.note}
                        </span>
                      )}
                    </div>
                  </div>

                  {punishedDate ? (
                    <span
                      title={`Marked punished on ${punishedDate}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Punished ({punishedDate})
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-600/20">
                      <Clock className="h-3 w-3" />
                      Unpunished
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {records.length > maxRows && (
            <p className="mt-3 text-xs text-slate-500">
              Showing latest {maxRows} of {records.length} late arrival records.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

