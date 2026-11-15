import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

async function run() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }

  const { ALL_MODELS, MODEL_DEFS } = await import("../src/lib/firestore-schema");
  const { commitFirestoreBatch } = await import("../src/lib/firestore-backend");
  const { getFirebaseSdkMode } = await import("../src/lib/firebase-admin");
  const { firebaseConfig } = await import("../src/lib/firebase");

  console.log(
    `Migrating local SQLite database -> Firebase Cloud Firestore (${firebaseConfig.projectId}, ${getFirebaseSdkMode()})...`
  );

  const sqlite = new PrismaClient();
  const operations: {
    type: "set";
    col: string;
    id: string;
    data: Record<string, unknown> & { id: string };
  }[] = [];

  try {
    for (const model of ALL_MODELS) {
      const delegate = (
        sqlite as unknown as Record<
          string,
          { findMany: () => Promise<(Record<string, unknown> & { id: string })[]> }
        >
      )[model];
      if (!delegate) continue;

      const rows = await delegate.findMany();
      const col = MODEL_DEFS[model].collection;
      for (const row of rows) {
        operations.push({
          type: "set",
          col,
          id: row.id,
          data: row,
        });
      }
      console.log(`  - ${col}: ${rows.length} record(s)`);
    }

    if (operations.length === 0) {
      console.log("No SQLite records found to migrate. Run `npm run db:seed` to populate Firestore.");
      return;
    }

    await commitFirestoreBatch(operations);
    console.log(`Successfully migrated ${operations.length} total records to Cloud Firestore.`);
  } finally {
    await sqlite.$disconnect();
  }
}

run().catch((err) => {
  console.error("SQLite -> Firebase migration failed:", err);
  process.exit(1);
});

