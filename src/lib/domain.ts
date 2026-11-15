export type GradeScaleRule = {
  minScore: number;
  maxScore: number;
  grade: string;
  remark: string;
};

export type ComputedGrade = {
  percentage: number;
  grade: string;
  remark: string;
};

export function calculateLetterGrade(
  score: number,
  maxMarks: number,
  scales: GradeScaleRule[]
): ComputedGrade {
  if (maxMarks <= 0) {
    return { percentage: 0, grade: "N/A", remark: "Invalid max marks" };
  }
  const clamped = Math.max(0, Math.min(score, maxMarks));
  const percentage = Math.round(((clamped / maxMarks) * 100) * 100) / 100;

  const sorted = [...scales].sort((a, b) => b.minScore - a.minScore);
  const matched = sorted.find(
    (s) => percentage >= s.minScore && percentage <= s.maxScore
  );

  if (matched) {
    return { percentage, grade: matched.grade, remark: matched.remark };
  }
  return { percentage, grade: "F", remark: "Fail" };
}

export function calculateInvoiceTotals(
  items: { amountCents: number }[],
  discountCents = 0
): {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
} {
  const subtotalCents = items.reduce(
    (sum, item) => sum + Math.max(0, Math.round(item.amountCents)),
    0
  );
  const safeDiscount = Math.min(
    subtotalCents,
    Math.max(0, Math.round(discountCents))
  );
  return {
    subtotalCents,
    discountCents: safeDiscount,
    totalCents: subtotalCents - safeDiscount,
  };
}

export function calculateInvoiceStatus(
  totalCents: number,
  paidCents: number
): "UNPAID" | "PARTIAL" | "PAID" {
  if (totalCents <= 0 || paidCents >= totalCents) {
    return "PAID";
  }
  if (paidCents > 0) {
    return "PARTIAL";
  }
  return "UNPAID";
}

export function formatCurrency(cents: number, symbol = "$"): string {
  const negative = cents < 0;
  const absDollars = (Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${negative ? "-" : ""}${symbol}${absDollars}`;
}

export function dollarsToCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

export function generateSequenceCode(
  prefix: string,
  year: number,
  sequenceNumber: number,
  padLength = 4
): string {
  const seq = String(Math.max(1, sequenceNumber)).padStart(padLength, "0");
  return `${prefix}-${year}-${seq}`;
}

export type TimetableEntry = {
  id?: string;
  classId: string;
  teacherId: string;
  dayOfWeek: number;
  period: number;
};

export function detectTimetableConflict(
  existing: TimetableEntry[],
  candidate: TimetableEntry
): string | null {
  for (const slot of existing) {
    if (candidate.id && slot.id === candidate.id) continue;
    if (slot.dayOfWeek !== candidate.dayOfWeek || slot.period !== candidate.period) {
      continue;
    }
    if (slot.classId === candidate.classId) {
      return "This class already has a subject scheduled in this day and period.";
    }
    if (slot.teacherId === candidate.teacherId) {
      return "This teacher is already assigned to another class in this day and period.";
    }
  }
  return null;
}

export function summarizeAttendance(
  records: { status: "PRESENT" | "ABSENT" | "LATE" }[]
): {
  total: number;
  present: number;
  absent: number;
  late: number;
  ratePercent: number;
} {
  const total = records.length;
  let present = 0;
  let absent = 0;
  let late = 0;
  for (const r of records) {
    if (r.status === "PRESENT") present++;
    else if (r.status === "ABSENT") absent++;
    else if (r.status === "LATE") late++;
  }
  const attended = present + late;
  const ratePercent = total === 0 ? 0 : Math.round((attended / total) * 1000) / 10;
  return { total, present, absent, late, ratePercent };
}

export const DAYS_OF_WEEK: { value: number; label: string; short: string }[] = [
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  EVC_PLUS: "EVC Plus",
  ZAAD: "Zaad",
  EDAHAB: "eDahab",
  BANK: "Bank Transfer",
};

export type RankedStudentResult = {
  studentId: string;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  rank: number;
  outOf: number;
  classAveragePercent: number;
};

/**
 * Computes dense/standard competition class rankings (1, 2, 2, 4) based on percentage/total score.
 */
export function computeClassRankings(
  entries: { studentId: string; totalObtained: number; totalMax: number }[]
): RankedStudentResult[] {
  const valid = entries
    .filter((e) => e.totalMax > 0)
    .map((e) => ({
      ...e,
      percentage: Math.round(((e.totalObtained / e.totalMax) * 100) * 100) / 100,
    }))
    .sort((a, b) =>
      b.percentage !== a.percentage
        ? b.percentage - a.percentage
        : b.totalObtained - a.totalObtained
    );

  const outOf = valid.length;
  if (outOf === 0) return [];

  const classAveragePercent =
    Math.round(
      (valid.reduce((sum, r) => sum + r.percentage, 0) / outOf) * 100
    ) / 100;

  const ranked: RankedStudentResult[] = [];
  for (let i = 0; i < valid.length; i++) {
    const cur = valid[i];
    const prev = i > 0 ? valid[i - 1] : null;
    const rank =
      prev && prev.percentage === cur.percentage ? ranked[i - 1].rank : i + 1;
    ranked.push({
      studentId: cur.studentId,
      totalObtained: cur.totalObtained,
      totalMax: cur.totalMax,
      percentage: cur.percentage,
      rank,
      outOf,
      classAveragePercent,
    });
  }
  return ranked;
}

export function getOrdinalSuffix(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function parseYearMonth(ym?: string | null): {
  ym: string;
  year: number;
  monthIndex: number;
  daysInMonth: number;
  label: string;
} {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [yStr, mStr] = ym.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12) {
      year = y;
      month = m;
    }
  }

  const normalizedYm = `${year}-${String(month).padStart(2, "0")}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const label = new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  return {
    ym: normalizedYm,
    year,
    monthIndex: month - 1,
    daysInMonth,
    label,
  };
}
