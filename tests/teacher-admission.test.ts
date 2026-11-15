import { describe, expect, it } from "vitest";
import { canAccessPath, ROLE_NAV } from "@/lib/role-routes";
import {
  marksBatchSchema,
  promoteStudentsSchema,
  reportRemarksBatchSchema,
  studentAccountActionSchema,
} from "@/lib/validation";

describe("Admission & Teacher route RBAC", () => {
  it("exposes Class Results & Teaching Timetable links to Admin and Teacher", () => {
    expect(ROLE_NAV.TEACHER.some((n) => n.href === "/teacher/results")).toBe(true);
    expect(ROLE_NAV.ADMIN.some((n) => n.href === "/teacher/results")).toBe(true);
    expect(ROLE_NAV.ADMIN.some((n) => n.href === "/teacher/timetable")).toBe(true);
  });

  it("grants Admin full access across all admission, teacher, and print routes", () => {
    expect(canAccessPath("ADMIN", "/teacher/results")).toBe(true);
    expect(canAccessPath("ADMIN", "/teacher/students/stu_1")).toBe(true);
    expect(canAccessPath("ADMIN", "/admission/students/stu_1")).toBe(true);
    expect(canAccessPath("ADMIN", "/print/id-cards")).toBe(true);
    expect(canAccessPath("ADMIN", "/print/report-cards/cls_1/ex_1")).toBe(true);
  });

  it("scopes Teacher and Admission strictly to their own portal prefixes", () => {
    expect(canAccessPath("TEACHER", "/teacher/results")).toBe(true);
    expect(canAccessPath("TEACHER", "/teacher/students/stu_1")).toBe(true);
    expect(canAccessPath("TEACHER", "/admission/students/stu_1")).toBe(false);
    expect(canAccessPath("TEACHER", "/accountant")).toBe(false);

    expect(canAccessPath("ADMISSION", "/admission/students/stu_1")).toBe(true);
    expect(canAccessPath("ADMISSION", "/teacher/results")).toBe(false);
    expect(canAccessPath("ADMISSION", "/accountant")).toBe(false);

    expect(canAccessPath("ACCOUNTANT", "/teacher/results")).toBe(false);
    expect(canAccessPath("STUDENT", "/teacher/results")).toBe(false);
  });
});

describe("Admission & Teacher validation schemas", () => {
  it("validates student account actions and rejects invalid actions", () => {
    expect(
      studentAccountActionSchema.safeParse({ action: "toggleActive", isActive: false }).success
    ).toBe(true);
    expect(
      studentAccountActionSchema.safeParse({ action: "resetPassword" }).success
    ).toBe(true);
    expect(
      studentAccountActionSchema.safeParse({ action: "deleteAdmin" }).success
    ).toBe(false);
  });

  it("validates promoteStudentsSchema and marks clearStudentIds", () => {
    expect(
      promoteStudentsSchema.safeParse({
        studentIds: ["stu_1"],
        toClassId: "cls_2",
        markGraduated: false,
        note: "Annual progression",
      }).success
    ).toBe(true);

    expect(
      marksBatchSchema.safeParse({
        examId: "ex_1",
        classId: "cls_1",
        subjectId: "sub_1",
        entries: [],
        clearStudentIds: ["stu_1"],
      }).success
    ).toBe(true);
  });

  it("validates reportRemarksBatchSchema", () => {
    expect(
      reportRemarksBatchSchema.safeParse({
        examId: "ex_1",
        classId: "cls_1",
        remarks: [
          {
            studentId: "stu_1",
            teacherRemark: "Excellent participation",
            principalRemark: "Keep it up",
          },
        ],
      }).success
    ).toBe(true);
  });
});

