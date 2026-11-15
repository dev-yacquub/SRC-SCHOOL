import { PrismaClient } from "@prisma/client";
import { firestorePrisma } from "./firestore-prisma";

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

function getSqliteClient(): PrismaClient {
  if (!globalForPrisma.sqlitePrisma) {
    globalForPrisma.sqlitePrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.sqlitePrisma;
}

export const databaseProvider: DatabaseProvider = getDatabaseProvider();

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  (databaseProvider === "firebase" ? firestorePrisma : getSqliteClient());

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
