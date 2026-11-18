import { describe, expect, it } from "vitest";
import {
  allocateInvoiceBalanceAcrossItems,
  buildExamSubjectSummaries,
  calculateInvoiceStatus,
  calculateInvoiceTotals,
  calculateLetterGrade,
  computeInvoiceItemBalances,
  deriveExamRollCallStates,
  detectTimetableConflict,
  dollarsToCents,
  filterAttendanceSearchStudents,
  filterUnbilledStudentFeeItems,
  formatCurrency,
  formatPaymentAllocationsSummary,
  generateSequenceCode,
  getLateArrivalStats,
  getMonthlyAbsenceStats,
  isBusFeeItem,
  normalizeFeeItemName,
  resolveStudentInvoiceItems,
  sortStudentsForAttendance,
  summarizeAttendance,
} from "../src/lib/domain";
import {
  examAttendanceBatchSchema,
  generateInvoicesSchema,
  recordPaymentSchema,
  updateInvoiceSchema,
  updatePaymentSchema,
} from "../src/lib/validation";

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

  it("identifies bus fee items and resolves student invoice items based on bus usage", () => {
    const classFees = [
      { name: "Tuition Fee", amountCents: 15000, isBusFee: false },
      { name: "Bus Fee", amountCents: 3000, isBusFee: true },
    ];

    expect(isBusFeeItem({ name: "Tuition Fee", isBusFee: false })).toBe(false);
    expect(isBusFeeItem({ name: "Bus Fee", isBusFee: true })).toBe(true);
    expect(isBusFeeItem({ name: "School Transport", isBusFee: false })).toBe(true);

    // Non-bus student only gets regular fees
    expect(
      resolveStudentInvoiceItems(classFees, { usesBus: false, busFeeCents: null })
    ).toEqual([{ name: "Tuition Fee", amountCents: 15000 }]);

    // Bus student gets class bus fee by default
    expect(
      resolveStudentInvoiceItems(classFees, { usesBus: true, busFeeCents: null })
    ).toEqual([
      { name: "Tuition Fee", amountCents: 15000 },
      { name: "Bus Fee", amountCents: 3000 },
    ]);

    // Bus student with custom bus fee override gets custom amount
    expect(
      resolveStudentInvoiceItems(classFees, { usesBus: true, busFeeCents: 4500 })
    ).toEqual([
      { name: "Tuition Fee", amountCents: 15000 },
      { name: "Bus Fee", amountCents: 4500 },
    ]);
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

  it("summarizes attendance rates with PRESENT and ABSENT", () => {
    const summary = summarizeAttendance([
      { status: "PRESENT" },
      { status: "PRESENT" },
      { status: "PRESENT" },
      { status: "ABSENT" },
    ]);
    expect(summary).toEqual({
      total: 4,
      present: 3,
      absent: 1,
      ratePercent: 75,
    });
  });

  it("formats Shift A and Shift B labels, validates shift payload, and rejects LATE", async () => {
    const { ATTENDANCE_SHIFTS, formatShiftLabel } = await import("@/lib/domain");
    const { attendanceBatchSchema } = await import("@/lib/validation");

    expect(ATTENDANCE_SHIFTS.map((s) => s.value)).toEqual(["SHIFT_A", "SHIFT_B"]);
    expect(formatShiftLabel("SHIFT_A")).toBe("Shift A");
    expect(formatShiftLabel("SHIFT_B")).toBe("Shift B");
    expect(formatShiftLabel(undefined)).toBe("Shift A");

    const parsedDefault = attendanceBatchSchema.parse({
      classId: "cls-1",
      date: "2026-11-15",
      records: [{ studentId: "stu-1", status: "PRESENT" }],
    });
    expect(parsedDefault.shift).toBe("SHIFT_A");

    const parsedShiftB = attendanceBatchSchema.parse({
      classId: "cls-1",
      date: "2026-11-15",
      shift: "SHIFT_B",
      records: [{ studentId: "stu-1", status: "ABSENT" }],
    });
    expect(parsedShiftB.shift).toBe("SHIFT_B");

    const rejectedLate = attendanceBatchSchema.safeParse({
      classId: "cls-1",
      date: "2026-11-15",
      shift: "SHIFT_A",
      records: [{ studentId: "stu-1", status: "LATE" }],
    });
    expect(rejectedLate.success).toBe(false);
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

  it("extracts short class badge codes and formats hero attendance dates safely", async () => {
    const { getClassBadgeCode, formatHeroAttendanceDate } = await import("@/lib/domain");

    expect(getClassBadgeCode("Form One A")).toBe("A");
    expect(getClassBadgeCode("Form One B")).toBe("B");
    expect(getClassBadgeCode("Grade 1A")).toBe("1A");
    expect(getClassBadgeCode("Class 7")).toBe("7");
    expect(getClassBadgeCode("Form One")).toBe("FO");
    expect(getClassBadgeCode("KG1")).toBe("KG1");
    expect(getClassBadgeCode("")).toBe("?");

    expect(formatHeroAttendanceDate("2026-11-15")).toBe("SUNDAY, NOVEMBER 15");
    expect(formatHeroAttendanceDate("2026-02-31")).toBe("2026-02-31");
  });

  it("computes previous ISO date and summarizes students missing yesterday", async () => {
    const { getPreviousIsoDate, summarizeYesterdayMissingStudents } = await import(
      "@/lib/domain"
    );

    expect(getPreviousIsoDate("2026-11-16")).toBe("2026-11-15");
    expect(getPreviousIsoDate("2026-03-01")).toBe("2026-02-28");
    expect(getPreviousIsoDate("2024-03-01")).toBe("2024-02-29");
    expect(getPreviousIsoDate("2026-01-01")).toBe("2025-12-31");
    expect(getPreviousIsoDate("invalid")).toBe("invalid");

    const students = [
      { id: "s1", admissionNo: "ADM-2026-0001", fullName: "Aamiin Cabdi" },
      { id: "s2", admissionNo: "ADM-2026-0002", fullName: "Axmed Maxamed" },
      { id: "s3", admissionNo: "ADM-2026-0003", fullName: "Hodan Cali" },
    ];

    expect(summarizeYesterdayMissingStudents(students, [])).toEqual({
      recorded: false,
      recordedShifts: { SHIFT_A: false, SHIFT_B: false },
      missingStudents: [],
    });

    const summary = summarizeYesterdayMissingStudents(students, [
      { studentId: "s1", shift: "SHIFT_A", status: "PRESENT" },
      { studentId: "s2", shift: "SHIFT_A", status: "ABSENT" },
      { studentId: "s2", shift: "SHIFT_B", status: "ABSENT" },
      { studentId: "s3", shift: "SHIFT_A", status: "PRESENT" },
      { studentId: "s3", shift: "SHIFT_B", status: "ABSENT" },
    ]);

    expect(summary).toEqual({
      recorded: true,
      recordedShifts: { SHIFT_A: true, SHIFT_B: true },
      missingStudents: [
        {
          id: "s2",
          admissionNo: "ADM-2026-0002",
          fullName: "Axmed Maxamed",
          absentShifts: ["SHIFT_A", "SHIFT_B"],
        },
        {
          id: "s3",
          admissionNo: "ADM-2026-0003",
          fullName: "Hodan Cali",
          absentShifts: ["SHIFT_B"],
        },
      ],
    });
  });
});

describe("selective fee structure invoicing and payment allocation helpers", () => {
  it("preserves feeStructureId and respects requireBusFeeStructure in resolveStudentInvoiceItems", () => {
    const classFees = [
      { id: "fs-tuition", name: "Tuition Fee", amountCents: 15000, isBusFee: false },
      { id: "fs-bus", name: "Bus Fee", amountCents: 3000, isBusFee: true },
    ];
    const studentWithBus = { usesBus: true, busFeeCents: 3500 };

    const allResolved = resolveStudentInvoiceItems(classFees, studentWithBus);
    expect(allResolved).toEqual([
      { feeStructureId: "fs-tuition", name: "Tuition Fee", amountCents: 15000 },
      { feeStructureId: "fs-bus", name: "Bus Fee", amountCents: 3500 },
    ]);

    const tuitionOnlyWithGuard = resolveStudentInvoiceItems(
      [classFees[0]],
      studentWithBus,
      { requireBusFeeStructure: true }
    );
    expect(tuitionOnlyWithGuard).toEqual([
      { feeStructureId: "fs-tuition", name: "Tuition Fee", amountCents: 15000 },
    ]);

    const tuitionOnlyDefault = resolveStudentInvoiceItems([classFees[0]], studentWithBus);
    expect(tuitionOnlyDefault).toEqual([
      { feeStructureId: "fs-tuition", name: "Tuition Fee", amountCents: 15000 },
      { name: "Bus Fee", amountCents: 3500 },
    ]);
  });

  it("filters already-billed fee items by feeStructureId and normalized name", () => {
    expect(normalizeFeeItemName("  Tuition   Fee ")).toBe("tuition fee");

    const candidates = [
      { feeStructureId: "fs-1", name: "Tuition Fee", amountCents: 15000 },
      { feeStructureId: "fs-2", name: "Lab Fee", amountCents: 2500 },
      { feeStructureId: "fs-3", name: "Exam Fee", amountCents: 2000 },
    ];
    const alreadyBilled = [
      { feeStructureId: "fs-1", name: "Tuition Fee" },
      { feeStructureId: null, name: "  lab  fee " },
    ];

    expect(filterUnbilledStudentFeeItems(candidates, alreadyBilled)).toEqual([
      { feeStructureId: "fs-3", name: "Exam Fee", amountCents: 2000 },
    ]);
  });

  it("computes item balances with explicit allocations and legacy unallocated payments", () => {
    const computed = computeInvoiceItemBalances({
      totalCents: 20000,
      paidCents: 8000,
      items: [
        {
          id: "item-1",
          feeStructureId: "fs-1",
          name: "Tuition Fee",
          amountCents: 15000,
          allocations: [{ amountCents: 5000 }],
        },
        {
          id: "item-2",
          feeStructureId: "fs-2",
          name: "Bus Fee",
          amountCents: 5000,
          allocations: [],
        },
      ],
    });

    expect(computed.invoiceRemainingCents).toBe(12000);
    expect(computed.totalAllocatedCents).toBe(5000);
    expect(computed.unallocatedPaidCents).toBe(3000);
    expect(computed.items[0]).toMatchObject({
      id: "item-1",
      allocatedPaidCents: 5000,
      itemRemainingCents: 10000,
      maxPayableCents: 10000,
      isPaid: false,
    });
    expect(computed.items[1]).toMatchObject({
      id: "item-2",
      allocatedPaidCents: 0,
      itemRemainingCents: 5000,
      maxPayableCents: 5000,
      isPaid: false,
    });

    const fullyAllocated = computeInvoiceItemBalances({
      totalCents: 10000,
      paidCents: 8000,
      items: [
        {
          id: "item-a",
          feeStructureId: "fs-a",
          name: "Tuition Fee",
          amountCents: 6000,
          allocations: [{ amountCents: 6000 }],
        },
        {
          id: "item-b",
          feeStructureId: "fs-b",
          name: "Lab Fee",
          amountCents: 4000,
          allocations: [{ amountCents: 2000 }],
        },
      ],
    });

    expect(fullyAllocated.invoiceRemainingCents).toBe(2000);
    expect(fullyAllocated.items[0].isPaid).toBe(true);
    expect(fullyAllocated.items[0].maxPayableCents).toBe(0);
    expect(fullyAllocated.items[1].isPaid).toBe(false);
    expect(fullyAllocated.items[1].maxPayableCents).toBe(2000);
  });

  it("distributes invoice remaining balance across items when all unpaid items are selected", () => {
    const exactPlan = allocateInvoiceBalanceAcrossItems(
      [
        { id: "item-1", itemRemainingCents: 10000 },
        { id: "item-2", itemRemainingCents: 5000 },
      ],
      15000
    );
    expect(exactPlan).toEqual({
      "item-1": 10000,
      "item-2": 5000,
    });

    const discountedOrReducedPlan = allocateInvoiceBalanceAcrossItems(
      [
        { id: "item-1", itemRemainingCents: 10000 },
        { id: "item-2", itemRemainingCents: 5000 },
        { id: "item-3", itemRemainingCents: 2000 },
      ],
      12000
    );
    expect(discountedOrReducedPlan).toEqual({
      "item-1": 5000,
      "item-2": 5000,
      "item-3": 2000,
    });
  });

  it("formats payment allocations summary cleanly", () => {
    expect(formatPaymentAllocationsSummary(null)).toBe("General Invoice Payment");
    expect(formatPaymentAllocationsSummary([])).toBe("General Invoice Payment");

    const summary = formatPaymentAllocationsSummary([
      { itemName: "Tuition Fee", amountCents: 15000 },
      { itemName: "Bus Fee", amountCents: 3500 },
    ]);
    expect(summary).toBe("Tuition Fee ($150.00) + Bus Fee ($35.00)");
  });

  it("validates feeStructureIds and payment allocations in Zod schemas", () => {
    expect(
      generateInvoicesSchema.safeParse({
        termId: "term-1",
        classId: "class-1",
        feeStructureIds: ["fs-1", "fs-2"],
        discountAmount: 0,
      }).success
    ).toBe(true);

    expect(
      updateInvoiceSchema.safeParse({
        items: [
          { id: "item-1", feeStructureId: "fs-1", name: "Tuition Fee", amount: 150 },
        ],
      }).success
    ).toBe(true);

    expect(
      recordPaymentSchema.safeParse({
        invoiceId: "inv-1",
        amount: 50,
        method: "CASH",
        allocations: [
          { invoiceItemId: "item-1", feeStructureId: "fs-1", itemName: "Tuition Fee", amount: 50 },
        ],
      }).success
    ).toBe(true);

    expect(
      recordPaymentSchema.safeParse({
        invoiceId: "inv-1",
        amount: 50,
        method: "CASH",
        allocations: [{ invoiceItemId: "item-1", amount: 0 }],
      }).success
    ).toBe(false);

    expect(
      updatePaymentSchema.safeParse({
        id: "pay-1",
        amount: 75,
        method: "EVC_PLUS",
        allocations: [{ invoiceItemId: "item-1", amount: 75 }],
      }).success
    ).toBe(true);
  });
});

describe("Exam attendance helpers and validation", () => {
  it("summarizes recorded exam attendance counts per subject", () => {
    const subjects = [
      { id: "sub-phy", name: "Physics", code: "PHY" },
      { id: "sub-math", name: "Mathematics", code: "MATH" },
      { id: "sub-eng", name: "English", code: "ENG" },
    ];
    const records = [
      { studentId: "s1", subjectId: "sub-phy", status: "PRESENT" as const },
      { studentId: "s2", subjectId: "sub-phy", status: "ABSENT" as const },
      { studentId: "s1", subjectId: "sub-math", status: "PRESENT" as const },
      { studentId: "s2", subjectId: "sub-math", status: "PRESENT" as const },
    ];

    expect(buildExamSubjectSummaries(subjects, records)).toEqual([
      {
        subjectId: "sub-phy",
        name: "Physics",
        code: "PHY",
        totalCount: 2,
        presentCount: 1,
        absentCount: 1,
      },
      {
        subjectId: "sub-math",
        name: "Mathematics",
        code: "MATH",
        totalCount: 2,
        presentCount: 2,
        absentCount: 0,
      },
    ]);
  });

  it("derives multi-subject exam roll call states and detects mixed statuses", () => {
    const derived = deriveExamRollCallStates(
      ["s1", "s2", "s3"],
      ["sub-phy", "sub-math"],
      [
        { studentId: "s1", subjectId: "sub-phy", status: "PRESENT" },
        { studentId: "s1", subjectId: "sub-math", status: "PRESENT" },
        { studentId: "s2", subjectId: "sub-phy", status: "PRESENT" },
        { studentId: "s2", subjectId: "sub-math", status: "ABSENT" },
      ]
    );

    expect(derived.s1).toEqual({
      status: "PRESENT",
      recordedCount: 2,
      hasMixedStatuses: false,
    });
    expect(derived.s2).toEqual({
      status: "ABSENT",
      recordedCount: 2,
      hasMixedStatuses: true,
    });
    expect(derived.s3).toEqual({
      status: "PRESENT",
      recordedCount: 0,
      hasMixedStatuses: false,
    });
  });

  it("validates single and multi-subject exam attendance payloads", () => {
    expect(
      examAttendanceBatchSchema.safeParse({
        classId: "cls-1",
        examId: "",
        date: "2026-11-15",
        subjectIds: ["sub-phy", "sub-math"],
        records: [
          { studentId: "s1", status: "PRESENT" },
          { studentId: "s2", status: "ABSENT" },
        ],
      }).success
    ).toBe(true);

    expect(
      examAttendanceBatchSchema.safeParse({
        classId: "cls-1",
        date: "2026-11-15",
        subjectIds: [],
        records: [{ studentId: "s1", status: "PRESENT" }],
      }).success
    ).toBe(false);

    expect(
      examAttendanceBatchSchema.safeParse({
        classId: "cls-1",
        date: "2026/11/15",
        subjectIds: ["sub-phy"],
        records: [{ studentId: "s1", status: "PRESENT" }],
      }).success
    ).toBe(false);
  });
});

describe("Monthly absence threshold for punishment highlight", () => {
  it("flags students absent for 3 or more shifts even across fewer than 3 days", () => {
    const stats = getMonthlyAbsenceStats([
      { date: "2026-11-01", status: "ABSENT" },
      { date: "2026-11-01", status: "ABSENT" },
      { date: "2026-11-02", status: "ABSENT" },
      { date: "2026-11-02", status: "PRESENT" },
    ]);
    expect(stats).toEqual({
      absentDays: 2,
      absentShifts: 3,
      meetsAbsenceThreshold: true,
    });
  });

  it("flags students absent across 3 distinct days", () => {
    const stats = getMonthlyAbsenceStats([
      { date: "2026-11-01", status: "ABSENT" },
      { date: "2026-11-03", status: "ABSENT" },
      { date: "2026-11-05", status: "ABSENT" },
    ]);
    expect(stats).toEqual({
      absentDays: 3,
      absentShifts: 3,
      meetsAbsenceThreshold: true,
    });
  });

  it("does not flag students with fewer than 3 absent days and shifts", () => {
    const stats = getMonthlyAbsenceStats([
      { date: "2026-11-01", status: "ABSENT" },
      { date: "2026-11-01", status: "ABSENT" },
      { date: "2026-11-02", status: "PRESENT" },
    ]);
    expect(stats).toEqual({
      absentDays: 1,
      absentShifts: 2,
      meetsAbsenceThreshold: false,
    });
  });
});

describe("Late arrival threshold for red highlight", () => {
  it("highlights red when student has 3 or more unpunished late days", () => {
    const stats = getLateArrivalStats([
      { date: "2026-11-10", punishedAt: null },
      { date: "2026-11-11", punishedAt: null },
      { date: "2026-11-12", punishedAt: null },
    ]);
    expect(stats).toEqual({
      totalLateDays: 3,
      totalLateShifts: 3,
      unpunishedLateDays: 3,
      unpunishedLateShifts: 3,
      needsPunishmentHighlight: true,
    });
  });

  it("counts multiple shifts on the same day as 1 late day", () => {
    const stats = getLateArrivalStats([
      { date: "2026-11-10", punishedAt: null },
      { date: "2026-11-10", punishedAt: null },
      { date: "2026-11-11", punishedAt: null },
    ]);
    expect(stats).toEqual({
      totalLateDays: 2,
      totalLateShifts: 3,
      unpunishedLateDays: 2,
      unpunishedLateShifts: 3,
      needsPunishmentHighlight: false,
    });
  });

  it("clears highlight once late records are marked punished", () => {
    const now = new Date().toISOString();
    const stats = getLateArrivalStats([
      { date: "2026-11-10", punishedAt: now },
      { date: "2026-11-11", punishedAt: now },
      { date: "2026-11-12", punishedAt: now },
      { date: "2026-11-15", punishedAt: null },
    ]);
    expect(stats).toEqual({
      totalLateDays: 4,
      totalLateShifts: 4,
      unpunishedLateDays: 1,
      unpunishedLateShifts: 1,
      needsPunishmentHighlight: false,
    });
  });
});

describe("universal attendance search filtering", () => {
  const sampleStudents = [
    {
      id: "s1",
      admissionNo: "ADM-2026-0001",
      fullName: "Amina Hassan",
      classId: "c1",
      className: "Grade 5A",
      classLevel: 5,
      guardianPhone: "+252615111222",
    },
    {
      id: "s2",
      admissionNo: "ADM-2026-0002",
      fullName: "Ahmed Mohamed",
      classId: "c2",
      className: "Grade 6B",
      classLevel: 6,
      guardianPhone: "+252615333444",
    },
    {
      id: "s3",
      admissionNo: "ADM-2026-0012",
      fullName: "Mohamed Ahmed",
      classId: "c1",
      className: "Grade 5A",
      classLevel: 5,
      guardianPhone: "+252615999000",
    },
    {
      id: "s4",
      admissionNo: "ADM-2026-0020",
      fullName: "Hodan Ali",
      classId: "c3",
      className: "Form 1A",
      classLevel: 9,
      guardianPhone: "+252615555666",
    },
  ];

  it("returns empty results for blank queries", () => {
    expect(filterAttendanceSearchStudents(sampleStudents, "   ")).toEqual({
      totalMatches: 0,
      matches: [],
    });
  });

  it("matches students across multiple classes by name, admission no, class, and guardian phone", () => {
    const byName = filterAttendanceSearchStudents(sampleStudents, "ahmed");
    expect(byName.totalMatches).toBe(2);
    // Name starting with query ranks ahead of substring match
    expect(byName.matches.map((s) => s.id)).toEqual(["s2", "s3"]);

    const byClass = filterAttendanceSearchStudents(sampleStudents, "grade 5a");
    expect(byClass.matches.map((s) => s.id)).toEqual(["s1", "s3"]);

    const byMultiToken = filterAttendanceSearchStudents(
      sampleStudents,
      "ahmed grade 5"
    );
    expect(byMultiToken.matches.map((s) => s.id)).toEqual(["s3"]);

    const byPhone = filterAttendanceSearchStudents(sampleStudents, "555666");
    expect(byPhone.matches.map((s) => s.id)).toEqual(["s4"]);
  });

  it("ranks exact admission number matches first and enforces result limit while preserving totalMatches", () => {
    const exactAdm = filterAttendanceSearchStudents(
      sampleStudents,
      "adm-2026-0012"
    );
    expect(exactAdm.matches.map((s) => s.id)).toEqual(["s3"]);

    const limited = filterAttendanceSearchStudents(sampleStudents, "ADM-2026", 2);
    expect(limited.totalMatches).toBe(4);
    expect(limited.matches).toHaveLength(2);
  });

  it("orders students in the same class by registration time (newest at bottom) instead of A-to-Z", () => {
    const withNewStudent = [
      {
        id: "s-old-z",
        admissionNo: "ADM-2026-0001",
        fullName: "Zainab Omar",
        classId: "c1",
        className: "Grade 5A",
        classLevel: 5,
        createdAt: "2026-09-01T08:00:00.000Z",
      },
      {
        id: "s-old-m",
        admissionNo: "ADM-2026-0002",
        fullName: "Mohamed Ali",
        classId: "c1",
        className: "Grade 5A",
        classLevel: 5,
        createdAt: "2026-09-02T08:00:00.000Z",
      },
      {
        id: "s-new-a",
        admissionNo: "ADM-2026-0050",
        fullName: "Abdi Yusuf",
        classId: "c1",
        className: "Grade 5A",
        classLevel: 5,
        createdAt: "2026-11-18T06:00:00.000Z",
      },
    ];

    const byClass = filterAttendanceSearchStudents(withNewStudent, "grade 5a");
    expect(byClass.matches.map((s) => s.id)).toEqual([
      "s-old-z",
      "s-old-m",
      "s-new-a",
    ]);
  });
});

describe("attendance roster ordering for new and transitioned students", () => {
  it("places both newly registered students and students transitioned from another class at the bottom", () => {
    const classId = "cls-6a";
    const students = [
      {
        id: "s-transferred",
        admissionNo: "ADM-2025-0001",
        fullName: "Amina Original",
        createdAt: "2025-09-01T08:00:00.000Z", // oldest in school, but moved to cls-6a last
      },
      {
        id: "s-existing-1",
        admissionNo: "ADM-2026-0010",
        fullName: "Zainab Existing",
        createdAt: "2026-09-01T08:00:00.000Z",
      },
      {
        id: "s-existing-2",
        admissionNo: "ADM-2026-0011",
        fullName: "Bilal Existing",
        createdAt: "2026-09-02T08:00:00.000Z",
      },
      {
        id: "s-new-backdated",
        admissionNo: "ADM-2026-0099",
        fullName: "Abdi NewlyRegistered",
        createdAt: "2026-11-18T06:00:00.000Z", // registered today, even if admissionDate was backdated
      },
    ];

    const enrollments = [
      {
        studentId: "s-transferred",
        classId: "cls-5a",
        enrolledAt: "2025-09-01T08:00:00.000Z",
      },
      {
        studentId: "s-transferred",
        classId,
        enrolledAt: "2026-11-18T06:20:00.000Z", // moved into cls-6a after s-new-backdated
      },
      {
        studentId: "s-existing-1",
        classId,
        enrolledAt: "2026-09-01T08:00:00.000Z",
      },
      {
        studentId: "s-existing-2",
        classId,
        enrolledAt: "2026-09-02T08:00:00.000Z",
      },
      {
        studentId: "s-new-backdated",
        classId,
        enrolledAt: "2026-08-15T00:00:00.000Z", // backdated admissionDate shouldn't push them to the top
      },
    ];

    const ordered = sortStudentsForAttendance(students, enrollments, classId);
    expect(ordered.map((s) => s.id)).toEqual([
      "s-existing-1",
      "s-existing-2",
      "s-new-backdated",
      "s-transferred",
    ]);
  });

  it("preserves prior order when multiple students are promoted into a class in the same batch", () => {
    const classId = "cls-7a";
    const batchTs = "2026-11-18T07:00:00.000Z";
    const students = [
      {
        id: "s-promoted-2",
        admissionNo: "ADM-2026-0020",
        createdAt: "2026-09-05T08:00:00.000Z",
      },
      {
        id: "s-already-there",
        admissionNo: "ADM-2026-0005",
        createdAt: "2026-09-01T08:00:00.000Z",
      },
      {
        id: "s-promoted-1",
        admissionNo: "ADM-2026-0010",
        createdAt: "2026-09-03T08:00:00.000Z",
      },
    ];
    const enrollments = [
      { studentId: "s-already-there", classId, enrolledAt: "2026-09-01T08:00:00.000Z" },
      { studentId: "s-promoted-1", classId, enrolledAt: batchTs },
      { studentId: "s-promoted-2", classId, enrolledAt: batchTs },
    ];

    const ordered = sortStudentsForAttendance(students, enrollments, classId);
    expect(ordered.map((s) => s.id)).toEqual([
      "s-already-there",
      "s-promoted-1",
      "s-promoted-2",
    ]);
  });
});


