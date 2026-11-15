import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { BatchOperation } from "../src/lib/firestore-backend";
import type { ModelName } from "../src/lib/firestore-schema";

const ACCOUNTING_MODELS: ModelName[] = [
  "paymentAllocation",
  "payment",
  "invoiceItem",
  "invoice",
  "feeStructure",
  "expense",
];

const ACCOUNTING_ENTITY_TYPES = new Set([
  "Invoice",
  "Payment",
  "FeeStructure",
  "Expense",
]);

function isAccountingAuditLog(action: unknown, entityType: unknown): boolean {
  if (typeof entityType === "string" && ACCOUNTING_ENTITY_TYPES.has(entityType)) {
    return true;
  }
  if (typeof action === "string") {
    return (
      action.startsWith("INVOICE") ||
      action.startsWith("PAYMENT") ||
      action.startsWith("FEE_") ||
      action.startsWith("EXPENSE")
    );
  }
  return false;
}

async function clearFirestoreAccounting() {
  const { MODEL_DEFS } = await import("../src/lib/firestore-schema");
  const { commitFirestoreBatch, queryFirestoreCollection } = await import(
    "../src/lib/firestore-backend"
  );
  const { firebaseConfig } = await import("../src/lib/firebase");

  console.log(
    `Clearing accounting data from Cloud Firestore in project "${firebaseConfig.projectId}"...`
  );
  const operations: BatchOperation[] = [];

  for (const model of ACCOUNTING_MODELS) {
    const col = MODEL_DEFS[model].collection;
    const docs = await queryFirestoreCollection(col);
    for (const d of docs) {
      operations.push({ type: "delete", col, id: d.id });
    }
    if (docs.length > 0) {
      console.log(`  - ${col}: queued ${docs.length} document(s) for deletion`);
    }
  }

  const auditCol = MODEL_DEFS.auditLog.collection;
  const auditDocs = await queryFirestoreCollection(auditCol);
  let accountingAuditCount = 0;
  for (const log of auditDocs) {
    if (isAccountingAuditLog(log.action, log.entityType)) {
      operations.push({ type: "delete", col: auditCol, id: log.id });
      accountingAuditCount++;
    }
  }
  if (accountingAuditCount > 0) {
    console.log(
      `  - ${auditCol}: queued ${accountingAuditCount} accounting log(s) for deletion`
    );
  }

  const studentCol = MODEL_DEFS.student.collection;
  const students = await queryFirestoreCollection(studentCol);
  let busResetCount = 0;
  for (const st of students) {
    if (st.usesBus === true || st.busFeeCents !== null) {
      operations.push({
        type: "set",
        col: studentCol,
        id: st.id,
        data: {
          ...st,
          usesBus: false,
          busFeeCents: null,
          updatedAt: new Date(),
        },
      });
      busResetCount++;
    }
  }
  if (busResetCount > 0) {
    console.log(
      `  - ${studentCol}: reset bus fee settings on ${busResetCount} student(s)`
    );
  }

  if (operations.length === 0) {
    console.log("Cloud Firestore has no accounting data.");
    return;
  }

  await commitFirestoreBatch(operations);
  console.log(
    `Completed ${operations.length} accounting cleanup operation(s) in Cloud Firestore.`
  );
}

async function clearSqliteAccounting() {
  const sqlite = new PrismaClient();
  try {
    const results = await sqlite.$transaction([
      sqlite.paymentAllocation.deleteMany(),
      sqlite.payment.deleteMany(),
      sqlite.invoiceItem.deleteMany(),
      sqlite.invoice.deleteMany(),
      sqlite.feeStructure.deleteMany(),
      sqlite.expense.deleteMany(),
      sqlite.auditLog.deleteMany({
        where: {
          OR: [
            { entityType: { in: Array.from(ACCOUNTING_ENTITY_TYPES) } },
            { action: { startsWith: "INVOICE" } },
            { action: { startsWith: "PAYMENT" } },
            { action: { startsWith: "FEE_" } },
            { action: { startsWith: "EXPENSE" } },
          ],
        },
      }),
      sqlite.student.updateMany({
        where: {
          OR: [{ usesBus: true }, { busFeeCents: { not: null } }],
        },
        data: { usesBus: false, busFeeCents: null },
      }),
    ]);
    const total = results.reduce((sum, r) => sum + r.count, 0);
    console.log(`Cleared ${total} accounting record(s)/update(s) in local SQLite (prisma/dev.db).`);
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
    await clearFirestoreAccounting();
  }
  if (clearBoth || provider === "sqlite") {
    await clearSqliteAccounting();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to clear accounting data:", err);
  process.exit(1);
});

