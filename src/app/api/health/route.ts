import { NextResponse } from "next/server";
import { databaseProvider, prisma } from "@/lib/prisma";
import { firebaseConfig } from "@/lib/firebase";
import { getFirebaseSdkMode } from "@/lib/firebase-admin";
import { isFirestoreQuotaError } from "@/lib/firestore-backend";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser().catch(() => null);
  const isAdmin = user?.role === "ADMIN";
  const sdkMode =
    databaseProvider === "firebase"
      ? getFirebaseSdkMode()
      : `prisma-${databaseProvider}`;

  try {
    const settings = await prisma.schoolSettings.findUnique({
      where: { id: "default" },
      select: { id: true },
    });

    return NextResponse.json({
      ok: true,
      seeded: Boolean(settings),
      ...(isAdmin
        ? {
            provider: databaseProvider,
            projectId:
              databaseProvider === "firebase"
                ? firebaseConfig.projectId
                : undefined,
            sdkMode,
          }
        : {}),
    });
  } catch (err) {
    console.error("Health check error:", err);
    const quotaExceeded = isFirestoreQuotaError(err);
    return NextResponse.json(
      {
        ok: false,
        error: quotaExceeded
          ? "Cloud Firestore daily quota exceeded (RESOURCE_EXHAUSTED)"
          : "Database connection failed",
        ...(quotaExceeded ? { code: "RESOURCE_EXHAUSTED" } : {}),
        ...(isAdmin
          ? {
              provider: databaseProvider,
              sdkMode,
            }
          : {}),
      },
      { status: quotaExceeded ? 503 : 500 }
    );
  }
}

