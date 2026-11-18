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
  sqlPrismaUrl: string | undefined;
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

/**
 * Ensures PostgreSQL connection strings (e.g. Neon serverless pooler) include
 * sufficient connect_timeout and pool_timeout values so cold starts and multi-IP
 * DNS failovers do not abort at Prisma's 5s default.
 */
function resolveSqlDatasourceUrl(): string | undefined {
  const raw = (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ""
  ).trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (!lower.startsWith("postgres://") && !lower.startsWith("postgresql://")) {
    return raw;
  }
  try {
    const parsed = new URL(raw);
    const curConnect = Number(parsed.searchParams.get("connect_timeout") ?? 0);
    if (!Number.isFinite(curConnect) || curConnect < 15) {
      parsed.searchParams.set("connect_timeout", "15");
    }
    const curPool = Number(parsed.searchParams.get("pool_timeout") ?? 0);
    if (!Number.isFinite(curPool) || curPool < 25) {
      parsed.searchParams.set("pool_timeout", "25");
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function getSqlClient(): PrismaClient {
  const datasourceUrl = resolveSqlDatasourceUrl();
  if (
    !hasAllModels(globalForPrisma.sqlPrisma) ||
    globalForPrisma.sqlPrismaUrl !== datasourceUrl
  ) {
    globalForPrisma.sqlPrisma = new PrismaClient({
      ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
    globalForPrisma.sqlPrismaUrl = datasourceUrl;
  }
  return globalForPrisma.sqlPrisma;
}

export const databaseProvider: DatabaseProvider = getDatabaseProvider();

export const prisma: PrismaClient =
  databaseProvider === "firebase" ? firestorePrisma : getSqlClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
