import { PrismaClient } from "@prisma/client";
import { firestorePrisma } from "./firestore-prisma";
import { ALL_MODELS } from "./firestore-schema";

export type DatabaseProvider = "firebase" | "postgres" | "sqlite";

export function getDatabaseProvider(): DatabaseProvider {
  const configured = process.env.DATABASE_PROVIDER?.trim().toLowerCase();
  if (configured === "postgres" || configured === "postgresql") return "postgres";
  if (configured === "sqlite") return "sqlite";
  if (configured === "firebase" || configured === "firestore") return "firebase";
  const dbUrl = process.env.DATABASE_URL?.trim().toLowerCase() ?? "";
  if (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://")) {
    return "postgres";
  }
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID) {
    return "firebase";
  }
  return "sqlite";
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  sqlPrisma: PrismaClient | undefined;
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

function getSqlClient(): PrismaClient {
  if (!hasAllModels(globalForPrisma.sqlPrisma)) {
    globalForPrisma.sqlPrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.sqlPrisma;
}

export const databaseProvider: DatabaseProvider = getDatabaseProvider();

export const prisma: PrismaClient =
  databaseProvider === "firebase" ? firestorePrisma : getSqlClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
