import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

async function clearFirestore() {
  const { ALL_MODELS, MODEL_DEFS } = await import("../src/lib/firestore-schema");
  const { commitFirestoreBatch, queryFirestoreCollection } = await import(
    "../src/lib/firestore-backend"
  );
  const { firebaseConfig } = await import("../src/lib/firebase");

  console.log(`Clearing Cloud Firestore collections in project "${firebaseConfig.projectId}"...`);
  const deletions: { type: "delete"; col: string; id: string }[] = [];

  for (const model of ALL_MODELS) {
    const col = MODEL_DEFS[model].collection;
    const docs = await queryFirestoreCollection(col);
    for (const d of docs) {
      deletions.push({ type: "delete", col, id: d.id });
    }
    if (docs.length > 0) {
      console.log(`  - ${col}: queued ${docs.length} document(s) for deletion`);
    }
  }

  if (deletions.length === 0) {
    console.log("Cloud Firestore is already empty.");
    return;
  }

  await commitFirestoreBatch(deletions);
  console.log(`Removed ${deletions.length} total mock/existing documents from Cloud Firestore.`);
}

async function clearSqlite() {
  const sqlite = new PrismaClient();
  try {
    // Delete child tables before parent tables to satisfy SQLite foreign keys
    await sqlite.$transaction([
      sqlite.auditLog.deleteMany(),
      sqlite.paymentAllocation.deleteMany(),
      sqlite.payment.deleteMany(),
      sqlite.invoiceItem.deleteMany(),
      sqlite.invoice.deleteMany(),
      sqlite.feeStructure.deleteMany(),
      sqlite.expense.deleteMany(),
      sqlite.reportRemark.deleteMany(),
      sqlite.mark.deleteMany(),
      sqlite.examAttendance.deleteMany(),
      sqlite.exam.deleteMany(),
      sqlite.gradeScale.deleteMany(),
      sqlite.attendance.deleteMany(),
      sqlite.timetableSlot.deleteMany(),
      sqlite.classSubject.deleteMany(),
      sqlite.enrollment.deleteMany(),
      sqlite.student.deleteMany(),
      sqlite.teacher.deleteMany(),
      sqlite.subject.deleteMany(),
      sqlite.schoolClass.deleteMany(),
      sqlite.term.deleteMany(),
      sqlite.academicYear.deleteMany(),
      sqlite.user.deleteMany(),
      sqlite.schoolSettings.deleteMany(),
    ]);
    console.log("Cleared all tables in local SQLite (prisma/dev.db).");
  } finally {
    await sqlite.$disconnect();
  }
}

async function main() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }

  const clearBoth = process.argv.includes("--all");
  const provider = (process.env.DATABASE_PROVIDER ?? "firebase").toLowerCase();

  if (clearBoth || provider === "firebase" || provider === "firestore") {
    await clearFirestore();
  }
  if (clearBoth || provider === "sqlite") {
    await clearSqlite();
  }
}

main().catch((err) => {
  console.error("Failed to clear database:", err);
  process.exit(1);
});

