import { describe, expect, it } from "vitest";
import {
  calculateInvoiceStatus,
  calculateInvoiceTotals,
  calculateLetterGrade,
  detectTimetableConflict,
  dollarsToCents,
  formatCurrency,
  generateSequenceCode,
  summarizeAttendance,
} from "../src/lib/domain";

const defaultScales = [
  { minScore: 90, maxScore: 100, grade: "A", remark: "Excellent" },
  { minScore: 80, maxScore: 89.99, grade: "B", remark: "Very Good" },
  { minScore: 70, maxScore: 79.99, grade: "C", remark: "Good" },
  { minScore: 60, maxScore: 69.99, grade: "D", remark: "Satisfactory" },
  { minScore: 50, maxScore: 59.99, grade: "E", remark: "Pass" },
  { minScore: 0, maxScore: 49.99, grade: "F", remark: "Needs Improvement" },
];

describe("Grading calculations", () => {
  it("computes percentage and letter grade accurately", () => {
    expect(calculateLetterGrade(94, 100, defaultScales)).toEqual({
      percentage: 94,
      grade: "A",
      remark: "Excellent",
    });
    expect(calculateLetterGrade(40, 50, defaultScales)).toEqual({
      percentage: 80,
      grade: "B",
      remark: "Very Good",
    });
    expect(calculateLetterGrade(24, 50, defaultScales)).toEqual({
      percentage: 48,
      grade: "F",
      remark: "Needs Improvement",
    });
  });

  it("handles boundary values and zero max marks", () => {
    expect(calculateLetterGrade(100, 100, defaultScales).grade).toBe("A");
    expect(calculateLetterGrade(0, 100, defaultScales).grade).toBe("F");
    expect(calculateLetterGrade(50, 0, defaultScales).grade).toBe("N/A");
  });
});

describe("Invoice & payment calculations", () => {
  it("calculates invoice subtotal, clamped discount, and total in cents", () => {
    const totals = calculateInvoiceTotals(
      [{ amountCents: 6000 }, { amountCents: 1000 }],
      1500
    );
    expect(totals).toEqual({
      subtotalCents: 7000,
      discountCents: 1500,
      totalCents: 5500,
    });
  });

  it("clamps discount so total never goes negative", () => {
    const totals = calculateInvoiceTotals([{ amountCents: 5000 }], 9000);
    expect(totals).toEqual({
      subtotalCents: 5000,
      discountCents: 5000,
      totalCents: 0,
    });
  });

  it("derives invoice payment status accurately", () => {
    expect(calculateInvoiceStatus(7000, 0)).toBe("UNPAID");
    expect(calculateInvoiceStatus(7000, 3000)).toBe("PARTIAL");
    expect(calculateInvoiceStatus(7000, 7000)).toBe("PAID");
    expect(calculateInvoiceStatus(0, 0)).toBe("PAID");
  });

  it("formats currency and converts dollars to integer cents", () => {
    expect(dollarsToCents(12.34)).toBe(1234);
    expect(formatCurrency(123450, "$")).toBe("$1,234.50");
    expect(formatCurrency(-500, "$")).toBe("-$5.00");
  });
});

describe("Sequence codes, timetable conflicts, and attendance", () => {
  it("formats padded sequence codes", () => {
    expect(generateSequenceCode("ADM", 2026, 1)).toBe("ADM-2026-0001");
    expect(generateSequenceCode("INV", 2026, 42)).toBe("INV-2026-0042");
  });

  it("detects class and teacher timetable collisions", () => {
    const existing = [
      { id: "1", classId: "c1", teacherId: "t1", dayOfWeek: 6, period: 1 },
    ];
    expect(
      detectTimetableConflict(existing, {
        classId: "c1",
        teacherId: "t2",
        dayOfWeek: 6,
        period: 1,
      })
    ).toContain("class already has");

    expect(
      detectTimetableConflict(existing, {
        classId: "c2",
        teacherId: "t1",
        dayOfWeek: 6,
        period: 1,
      })
    ).toContain("teacher is already assigned");

    expect(
      detectTimetableConflict(existing, {
        classId: "c2",
        teacherId: "t2",
        dayOfWeek: 6,
        period: 1,
      })
    ).toBeNull();
  });

  it("summarizes attendance rates", () => {
    const summary = summarizeAttendance([
      { status: "PRESENT" },
      { status: "PRESENT" },
      { status: "LATE" },
      { status: "ABSENT" },
    ]);
    expect(summary).toEqual({
      total: 4,
      present: 2,
      absent: 1,
      late: 1,
      ratePercent: 75,
    });
  });

  it("computes class rankings with ties and class average", async () => {
    const { computeClassRankings } = await import("@/lib/domain");
    const rankings = computeClassRankings([
      { studentId: "a", totalObtained: 270, totalMax: 300 },
      { studentId: "b", totalObtained: 270, totalMax: 300 },
      { studentId: "c", totalObtained: 240, totalMax: 300 },
    ]);
    expect(rankings).toEqual([
      {
        studentId: "a",
        totalObtained: 270,
        totalMax: 300,
        percentage: 90,
        rank: 1,
        outOf: 3,
        classAveragePercent: 86.67,
      },
      {
        studentId: "b",
        totalObtained: 270,
        totalMax: 300,
        percentage: 90,
        rank: 1,
        outOf: 3,
        classAveragePercent: 86.67,
      },
      {
        studentId: "c",
        totalObtained: 240,
        totalMax: 300,
        percentage: 80,
        rank: 3,
        outOf: 3,
        classAveragePercent: 86.67,
      },
    ]);
  });

  it("formats ordinal suffixes correctly including teens", async () => {
    const { getOrdinalSuffix } = await import("@/lib/domain");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(getOrdinalSuffix)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
    ]);
  });

  it("parses YYYY-MM month strings with accurate day counts", async () => {
    const { parseYearMonth } = await import("@/lib/domain");
    expect(parseYearMonth("2026-02")).toEqual({
      ym: "2026-02",
      year: 2026,
      monthIndex: 1,
      daysInMonth: 28,
      label: "February 2026",
    });
    expect(parseYearMonth("2024-02")).toEqual({
      ym: "2024-02",
      year: 2024,
      monthIndex: 1,
      daysInMonth: 29,
      label: "February 2024",
    });
  });
});

