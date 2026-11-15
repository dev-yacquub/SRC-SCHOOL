import { PrismaClient } from "@prisma/client";
import { firestorePrisma } from "./firestore-prisma";
import { ALL_MODELS } from "./firestore-schema";

export type DatabaseProvider = "firebase" | "sqlite";

export function getDatabaseProvider(): DatabaseProvider {
  const configured = process.env.DATABASE_PROVIDER?.trim().toLowerCase();
  if (configured === "sqlite") return "sqlite";
  if (configured === "firebase" || configured === "firestore") return "firebase";
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID) {
    return "firebase";
  }
  return "sqlite";
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  sqlitePrisma: PrismaClient | undefined;
};

/** Ensure dev-cached Prisma singletons expose every model after schema updates. */
function hasAllModels(client: PrismaClient | undefined): client is PrismaClient {
  if (!client) return false;
  const record = client as unknown as Record<string, unknown>;
  return ALL_MODELS.every((model) => {
    const delegate = record[model];
    return typeof delegate === "object" && delegate !== null;
  });
}

function getSqliteClient(): PrismaClient {
  if (!hasAllModels(globalForPrisma.sqlitePrisma)) {
    globalForPrisma.sqlitePrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.sqlitePrisma;
}

export const databaseProvider: DatabaseProvider = getDatabaseProvider();

export const prisma: PrismaClient =
  databaseProvider === "firebase" ? firestorePrisma : getSqliteClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
