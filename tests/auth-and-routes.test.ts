import { describe, expect, it } from "vitest";
import {
  MAX_SESSION_AGE_MS,
  signEdgeSession,
  verifyEdgeSession,
} from "../src/lib/jwt-edge";
import { canAccessPath } from "../src/lib/role-routes";
import {
  changePasswordSchema,
  photoSchema,
  updateInvoiceSchema,
} from "../src/lib/validation";
import { isFirestoreQuotaError } from "../src/lib/firestore-backend";

describe("Edge session JWT", () => {
  it("signs and verifies a valid session token", async () => {
    const token = await signEdgeSession({
      userId: "u_1",
      username: "admin",
      fullName: "Admin User",
      role: "ADMIN",
      mustChangePassword: true,
    });
    const session = await verifyEdgeSession(token);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe("u_1");
    expect(session?.role).toBe("ADMIN");
    expect(session?.mustChangePassword).toBe(true);
    expect(typeof session?.sessionStartedAt).toBe("number");
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

  it("rejects tokens exceeding absolute session lifetime", async () => {
    const expiredStart = Date.now() - MAX_SESSION_AGE_MS - 5000;
    const token = await signEdgeSession({
      userId: "u_1",
      username: "admin",
      fullName: "Admin User",
      role: "ADMIN",
      sessionStartedAt: expiredStart,
    });
    expect(await verifyEdgeSession(token)).toBeNull();
  });

  it("refuses known weak fallback AUTH_SECRET", async () => {
    const prev = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET =
      "dev-school-management-secret-change-in-production-2026";
    try {
      await expect(
        signEdgeSession({
          userId: "u_1",
          username: "admin",
          fullName: "Admin User",
          role: "ADMIN",
        })
      ).rejects.toThrow(/Insecure AUTH_SECRET/);
    } finally {
      if (prev === undefined) {
        delete process.env.AUTH_SECRET;
      } else {
        process.env.AUTH_SECRET = prev;
      }
    }
  });
});

describe("Security validation schemas", () => {
  it("allows base64 raster data URLs and blocks external/SVG photo URLs", () => {
    expect(
      photoSchema.safeParse("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==").success
    ).toBe(true);
    expect(photoSchema.safeParse("").success).toBe(true);
    expect(
      photoSchema.safeParse("https://attacker.example/pixel.png").success
    ).toBe(false);
    expect(
      photoSchema.safeParse("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=").success
    ).toBe(false);
  });

  it("enforces minimum 8-character passwords and invoice discount bounds", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "old",
        newPassword: "short",
      }).success
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "old",
        newPassword: "StrongPassword1!",
      }).success
    ).toBe(true);
    expect(
      updateInvoiceSchema.safeParse({
        discountAmount: -10,
      }).success
    ).toBe(false);
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

describe("Firestore error helpers", () => {
  it("detects RESOURCE_EXHAUSTED quota errors across code and message shapes", () => {
    expect(
      isFirestoreQuotaError(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."))
    ).toBe(true);
    expect(isFirestoreQuotaError({ code: "resource-exhausted", message: "" })).toBe(
      true
    );
    expect(isFirestoreQuotaError(new Error("Daily quota exceeded"))).toBe(true);
    expect(isFirestoreQuotaError(new Error("PERMISSION_DENIED"))).toBe(false);
  });
});

