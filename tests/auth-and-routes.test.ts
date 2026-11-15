import { describe, expect, it } from "vitest";
import { signEdgeSession, verifyEdgeSession } from "../src/lib/jwt-edge";
import { canAccessPath } from "../src/lib/role-routes";

describe("Edge session JWT", () => {
  it("signs and verifies a valid session token", async () => {
    const token = await signEdgeSession({
      userId: "u_1",
      username: "admin",
      fullName: "Admin User",
      role: "ADMIN",
    });
    const session = await verifyEdgeSession(token);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe("u_1");
    expect(session?.role).toBe("ADMIN");
  });

  it("rejects tampered tokens", async () => {
    const token = await signEdgeSession({
      userId: "u_1",
      username: "admin",
      fullName: "Admin User",
      role: "ADMIN",
    });
    const tampered = `${token.slice(0, -4)}xxxx`;
    expect(await verifyEdgeSession(tampered)).toBeNull();
  });
});

describe("Role-based route access matrix", () => {
  it("grants ADMIN full access to all portals", () => {
    expect(canAccessPath("ADMIN", "/admin")).toBe(true);
    expect(canAccessPath("ADMIN", "/admin/users")).toBe(true);
    expect(canAccessPath("ADMIN", "/admission/students")).toBe(true);
    expect(canAccessPath("ADMIN", "/teacher/marks")).toBe(true);
    expect(canAccessPath("ADMIN", "/teacher/attendance")).toBe(true);
    expect(canAccessPath("ADMIN", "/accountant/payments")).toBe(true);
    expect(canAccessPath("ADMIN", "/student")).toBe(true);
    expect(canAccessPath("ADMIN", "/print/receipt/1")).toBe(true);
  });

  it("restricts admin routes for non-admin roles", () => {
    expect(canAccessPath("TEACHER", "/admin")).toBe(false);
    expect(canAccessPath("STUDENT", "/admin/exams")).toBe(false);
    expect(canAccessPath("ACCOUNTANT", "/admin")).toBe(false);
    expect(canAccessPath("ADMISSION", "/admin")).toBe(false);
  });

  it("restricts teacher, student, and accountant portals properly", () => {
    expect(canAccessPath("TEACHER", "/teacher/marks")).toBe(true);
    expect(canAccessPath("STUDENT", "/teacher/marks")).toBe(false);
    expect(canAccessPath("STUDENT", "/student/results")).toBe(true);
    expect(canAccessPath("ACCOUNTANT", "/accountant/payments")).toBe(true);
    expect(canAccessPath("ADMISSION", "/accountant/payments")).toBe(false);
    expect(canAccessPath("ADMISSION", "/admission/register")).toBe(true);
    expect(canAccessPath("ADMIN", "/admission/students")).toBe(true);
  });
});

