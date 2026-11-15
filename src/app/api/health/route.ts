import { NextResponse } from "next/server";
import { databaseProvider, prisma } from "@/lib/prisma";
import { firebaseConfig } from "@/lib/firebase";
import { getFirebaseSdkMode } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser().catch(() => null);
  const isAdmin = user?.role === "ADMIN";
  const sdkMode =
    databaseProvider === "firebase" ? getFirebaseSdkMode() : "prisma-sqlite";

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
    return NextResponse.json(
      {
        ok: false,
        error: "Database connection failed",
        ...(isAdmin
          ? {
              provider: databaseProvider,
              sdkMode,
            }
          : {}),
      },
      { status: 500 }
    );
  }
}

