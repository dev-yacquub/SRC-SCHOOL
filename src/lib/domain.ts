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

export function isBusFeeItem(item: {
  name: string;
  isBusFee?: boolean | null;
}): boolean {
  if (item.isBusFee) return true;
  return /\b(bus|transport)\b/i.test(item.name);
}

export type ResolvedInvoiceItem = {
  feeStructureId?: string;
  name: string;
  amountCents: number;
};

export function resolveStudentInvoiceItems(
  classFeeStructures: {
    id?: string;
    name: string;
    amountCents: number;
    isBusFee?: boolean | null;
  }[],
  student: {
    usesBus?: boolean | null;
    busFeeCents?: number | null;
  },
  options?: { requireBusFeeStructure?: boolean }
): ResolvedInvoiceItem[] {
  const regularItems: ResolvedInvoiceItem[] = classFeeStructures
    .filter((f) => !isBusFeeItem(f))
    .map((f) => ({
      ...(f.id ? { feeStructureId: f.id } : {}),
      name: f.name,
      amountCents: f.amountCents,
    }));

  if (!student.usesBus) {
    return regularItems;
  }

  const busItems = classFeeStructures.filter((f) => isBusFeeItem(f));
  if (options?.requireBusFeeStructure && busItems.length === 0) {
    return regularItems;
  }

  const hasCustomOverride =
    typeof student.busFeeCents === "number" && student.busFeeCents > 0;

  if (hasCustomOverride) {
    return [
      ...regularItems,
      {
        ...(busItems[0]?.id ? { feeStructureId: busItems[0].id } : {}),
        name: busItems[0]?.name ?? "Bus Fee",
        amountCents: Math.round(student.busFeeCents!),
      },
    ];
  }

  return [
    ...regularItems,
    ...busItems.map((b) => ({
      ...(b.id ? { feeStructureId: b.id } : {}),
      name: b.name,
      amountCents: b.amountCents,
    })),
  ];
}

export function normalizeFeeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function filterUnbilledStudentFeeItems<
  T extends { feeStructureId?: string | null; name: string },
>(
  candidateItems: T[],
  alreadyBilledItems: { feeStructureId?: string | null; name: string }[]
): T[] {
  const billedIds = new Set(
    alreadyBilledItems
      .map((i) => i.feeStructureId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
  const billedNames = new Set(
    alreadyBilledItems.map((i) => normalizeFeeItemName(i.name))
  );

  return candidateItems.filter((item) => {
    if (item.feeStructureId && billedIds.has(item.feeStructureId)) {
      return false;
    }
    if (billedNames.has(normalizeFeeItemName(item.name))) {
      return false;
    }
    return true;
  });
}

export type InvoiceItemBalanceInput = {
  id: string;
  feeStructureId?: string | null;
  name: string;
  amountCents: number;
  allocations?: { amountCents: number }[];
};

export type ComputedInvoiceItemBalance = {
  id: string;
  feeStructureId: string | null;
  name: string;
  amountCents: number;
  allocatedPaidCents: number;
  itemRemainingCents: number;
  maxPayableCents: number;
  isPaid: boolean;
};

export type ComputedInvoiceBalances = {
  invoiceRemainingCents: number;
  totalAllocatedCents: number;
  unallocatedPaidCents: number;
  items: ComputedInvoiceItemBalance[];
};

export function computeInvoiceItemBalances(invoice: {
  totalCents: number;
  paidCents: number;
  items: InvoiceItemBalanceInput[];
}): ComputedInvoiceBalances {
  const invoiceRemainingCents = Math.max(
    0,
    invoice.totalCents - invoice.paidCents
  );
  let totalAllocatedCents = 0;

  const items: ComputedInvoiceItemBalance[] = invoice.items.map((item) => {
    const allocatedPaidCents = (item.allocations ?? []).reduce(
      (sum, a) => sum + Math.max(0, a.amountCents),
      0
    );
    totalAllocatedCents += allocatedPaidCents;
    const itemRemainingCents = Math.max(
      0,
      item.amountCents - allocatedPaidCents
    );
    const maxPayableCents = Math.min(itemRemainingCents, invoiceRemainingCents);
    return {
      id: item.id,
      feeStructureId: item.feeStructureId ?? null,
      name: item.name,
      amountCents: item.amountCents,
      allocatedPaidCents,
      itemRemainingCents,
      maxPayableCents,
      isPaid: maxPayableCents <= 0,
    };
  });

  const unallocatedPaidCents = Math.max(
    0,
    invoice.paidCents - totalAllocatedCents
  );

  return {
    invoiceRemainingCents,
    totalAllocatedCents,
    unallocatedPaidCents,
    items,
  };
}

export function allocateInvoiceBalanceAcrossItems(
  items: { id: string; itemRemainingCents: number }[],
  invoiceRemainingCents: number
): Record<string, number> {
  const budget = Math.max(0, Math.round(invoiceRemainingCents));
  const totalRemaining = items.reduce(
    (sum, it) => sum + Math.max(0, it.itemRemainingCents),
    0
  );
  const result: Record<string, number> = {};
  for (const it of items) {
    result[it.id] = Math.max(0, it.itemRemainingCents);
  }
  if (totalRemaining <= budget) {
    return result;
  }

  let excess = totalRemaining - budget;
  const sortedBySize = [...items].sort(
    (a, b) => b.itemRemainingCents - a.itemRemainingCents
  );
  for (const it of sortedBySize) {
    if (excess <= 0) break;
    const cur = result[it.id];
    const deduct = Math.min(cur, excess);
    result[it.id] = cur - deduct;
    excess -= deduct;
  }
  return result;
}

export function formatPaymentAllocationsSummary(
  allocations: { itemName: string; amountCents: number }[] | undefined | null,
  symbol = "$"
): string {
  if (!allocations || allocations.length === 0) {
    return "General Invoice Payment";
  }
  return allocations
    .map((a) => `${a.itemName} (${formatCurrency(a.amountCents, symbol)})`)
    .join(" + ");
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

export const ATTENDANCE_SHIFTS: {
  value: "SHIFT_A" | "SHIFT_B";
  label: string;
  short: string;
}[] = [
  { value: "SHIFT_A", label: "Shift A", short: "A" },
  { value: "SHIFT_B", label: "Shift B", short: "B" },
];

export function formatShiftLabel(shift?: string | null): string {
  return shift === "SHIFT_B" ? "Shift B" : "Shift A";
}

export function summarizeAttendance(
  records: { status: "PRESENT" | "ABSENT" | string }[]
): {
  total: number;
  present: number;
  absent: number;
  ratePercent: number;
} {
  const total = records.length;
  let present = 0;
  let absent = 0;
  for (const r of records) {
    if (r.status === "ABSENT") absent++;
    else present++;
  }
  const ratePercent = total === 0 ? 0 : Math.round((present / total) * 1000) / 10;
  return { total, present, absent, ratePercent };
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

/**
 * Extracts a short 1-3 character badge code from a class name (e.g. "Form One A" -> "A", "Grade 1A" -> "1A").
 */
export function getClassBadgeCode(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1) {
    return trimmed.slice(0, 3).toUpperCase();
  }
  const last = tokens[tokens.length - 1];
  if (/^([A-Z]|\d+[A-Z]?)$/i.test(last)) {
    return last.toUpperCase();
  }
  return `${tokens[0][0]}${last[0]}`.toUpperCase();
}

/**
 * Computes the previous calendar date in YYYY-MM-DD format without UTC timezone drift.
 */
export function getPreviousIsoDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return isoDate;
  }
  dt.setUTCDate(dt.getUTCDate() - 1);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type MissingYesterdayStudent = {
  id: string;
  admissionNo: string;
  fullName: string;
  gender?: string;
  absentShifts: ("SHIFT_A" | "SHIFT_B")[];
};

/**
 * Summarizes which students in a class were marked ABSENT on the previous day across shifts.
 */
export function summarizeYesterdayMissingStudents(
  students: {
    id: string;
    admissionNo: string;
    fullName: string;
    gender?: string;
  }[],
  records: {
    studentId: string;
    shift?: string | null;
    status: "PRESENT" | "ABSENT" | string;
  }[]
): {
  recorded: boolean;
  recordedShifts: {
    SHIFT_A: boolean;
    SHIFT_B: boolean;
  };
  missingStudents: MissingYesterdayStudent[];
} {
  const recordedShifts = {
    SHIFT_A: records.some((r) => (r.shift ?? "SHIFT_A") === "SHIFT_A"),
    SHIFT_B: records.some((r) => r.shift === "SHIFT_B"),
  };
  const recorded = recordedShifts.SHIFT_A || recordedShifts.SHIFT_B;

  const absentShiftsByStudent = new Map<string, Set<"SHIFT_A" | "SHIFT_B">>();
  for (const r of records) {
    if (r.status !== "ABSENT") continue;
    const sh: "SHIFT_A" | "SHIFT_B" =
      r.shift === "SHIFT_B" ? "SHIFT_B" : "SHIFT_A";
    let set = absentShiftsByStudent.get(r.studentId);
    if (!set) {
      set = new Set();
      absentShiftsByStudent.set(r.studentId, set);
    }
    set.add(sh);
  }

  const missingStudents: MissingYesterdayStudent[] = [];
  for (const s of students) {
    const set = absentShiftsByStudent.get(s.id);
    if (!set || set.size === 0) continue;
    const absentShifts: ("SHIFT_A" | "SHIFT_B")[] = [];
    if (set.has("SHIFT_A")) absentShifts.push("SHIFT_A");
    if (set.has("SHIFT_B")) absentShifts.push("SHIFT_B");
    missingStudents.push({
      id: s.id,
      admissionNo: s.admissionNo,
      fullName: s.fullName,
      ...(s.gender !== undefined ? { gender: s.gender } : {}),
      absentShifts,
    });
  }

  return {
    recorded,
    recordedShifts,
    missingStudents,
  };
}

/**
 * Formats an ISO calendar date string (YYYY-MM-DD) into an uppercase hero banner label without UTC timezone drift.
 */
export function formatHeroAttendanceDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate.toUpperCase();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localDate = new Date(year, month - 1, day);
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return isoDate.toUpperCase();
  }
  return localDate
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();
}

export type ExamAttendanceRecordInput = {
  studentId: string;
  subjectId: string;
  status: "PRESENT" | "ABSENT";
};

export type ExamSubjectMeta = {
  id: string;
  name: string;
  code: string;
};

export type ExamSubjectAttendanceSummary = {
  subjectId: string;
  name: string;
  code: string;
  totalCount: number;
  presentCount: number;
  absentCount: number;
};

/**
 * Summarizes recorded exam attendance counts per subject for a given date and class.
 */
export function buildExamSubjectSummaries(
  subjects: ExamSubjectMeta[],
  records: ExamAttendanceRecordInput[]
): ExamSubjectAttendanceSummary[] {
  const counts = new Map<string, { present: number; absent: number }>();
  for (const r of records) {
    const cur = counts.get(r.subjectId) ?? { present: 0, absent: 0 };
    if (r.status === "ABSENT") {
      cur.absent += 1;
    } else {
      cur.present += 1;
    }
    counts.set(r.subjectId, cur);
  }
  const result: ExamSubjectAttendanceSummary[] = [];
  for (const s of subjects) {
    const c = counts.get(s.id);
    if (!c) continue;
    result.push({
      subjectId: s.id,
      name: s.name,
      code: s.code,
      totalCount: c.present + c.absent,
      presentCount: c.present,
      absentCount: c.absent,
    });
  }
  return result;
}

/**
 * Derives per-student roll call state across one or more selected exam subjects.
 * Defaults to PRESENT when unrecorded and ABSENT if any selected subject is marked ABSENT.
 */
export function deriveExamRollCallStates(
  studentIds: string[],
  selectedSubjectIds: string[],
  records: ExamAttendanceRecordInput[]
): Record<
  string,
  {
    status: "PRESENT" | "ABSENT";
    recordedCount: number;
    hasMixedStatuses: boolean;
  }
> {
  const selectedSet = new Set(selectedSubjectIds);
  const byStudent = new Map<string, Map<string, "PRESENT" | "ABSENT">>();
  for (const r of records) {
    if (!selectedSet.has(r.subjectId)) continue;
    let subjMap = byStudent.get(r.studentId);
    if (!subjMap) {
      subjMap = new Map();
      byStudent.set(r.studentId, subjMap);
    }
    subjMap.set(r.subjectId, r.status);
  }

  const out: Record<
    string,
    {
      status: "PRESENT" | "ABSENT";
      recordedCount: number;
      hasMixedStatuses: boolean;
    }
  > = {};

  for (const studentId of studentIds) {
    const subjMap = byStudent.get(studentId);
    if (!subjMap || subjMap.size === 0) {
      out[studentId] = {
        status: "PRESENT",
        recordedCount: 0,
        hasMixedStatuses: false,
      };
      continue;
    }
    const statuses = Array.from(subjMap.values());
    const hasPresent = statuses.includes("PRESENT");
    const hasAbsent = statuses.includes("ABSENT");
    out[studentId] = {
      status: hasAbsent ? "ABSENT" : "PRESENT",
      recordedCount: subjMap.size,
      hasMixedStatuses: hasPresent && hasAbsent,
    };
  }
  return out;
}
