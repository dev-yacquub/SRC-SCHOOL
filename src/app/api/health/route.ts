import { NextResponse } from "next/server";
import { databaseProvider, prisma } from "@/lib/prisma";
import { firebaseConfig } from "@/lib/firebase";
import { getFirebaseSdkMode } from "@/lib/firebase-admin";

export async function GET() {
  const sdkMode = databaseProvider === "firebase" ? getFirebaseSdkMode() : "prisma-sqlite";
  try {
    const settings = await prisma.schoolSettings.findUnique({
      where: { id: "default" },
      select: { id: true, schoolName: true },
    });

    return NextResponse.json({
      ok: true,
      provider: databaseProvider,
      projectId: databaseProvider === "firebase" ? firebaseConfig.projectId : undefined,
      sdkMode,
      seeded: Boolean(settings),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        provider: databaseProvider,
        projectId: databaseProvider === "firebase" ? firebaseConfig.projectId : undefined,
        sdkMode,
        error: err instanceof Error ? err.message : "Database connection failed",
      },
      { status: 500 }
    );
  }
}

