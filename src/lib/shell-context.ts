import { prisma } from "./prisma";

const SCHOOL_CONTEXT_TTL_MS = 30_000;

type SchoolContextValue = {
  settings: Awaited<ReturnType<typeof prisma.schoolSettings.findUnique>>;
  schoolName: string;
  currencySymbol: string;
  currentYear: Awaited<ReturnType<typeof prisma.academicYear.findFirst>>;
  currentTerm: Awaited<ReturnType<typeof prisma.term.findFirst>>;
  academicLabel: string | undefined;
};

const globalForShellContext = globalThis as unknown as {
  __schoolContextCache?: {
    value: SchoolContextValue;
    expiresAt: number;
  };
  __schoolContextInflight?: Promise<SchoolContextValue>;
};

export function invalidateSchoolContextCache() {
  globalForShellContext.__schoolContextCache = undefined;
  globalForShellContext.__schoolContextInflight = undefined;
}

async function fetchSchoolContext(): Promise<SchoolContextValue> {
  const [settings, currentYear, currentTerm] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: "default" } }),
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
    prisma.term.findFirst({ where: { isCurrent: true } }),
  ]);

  const schoolName =
    settings?.schoolName || process.env.SCHOOL_NAME || "SRC Tech School";
  const currencySymbol = settings?.currencySymbol ?? "$";
  const academicLabel = currentYear
    ? `${currentYear.name}${currentTerm ? ` · ${currentTerm.name}` : ""}`
    : undefined;

  return {
    settings,
    schoolName,
    currencySymbol,
    currentYear,
    currentTerm,
    academicLabel,
  };
}

export async function getSchoolContext(): Promise<SchoolContextValue> {
  const now = Date.now();
  const cached = globalForShellContext.__schoolContextCache;
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (!globalForShellContext.__schoolContextInflight) {
    globalForShellContext.__schoolContextInflight = fetchSchoolContext()
      .then((value) => {
        globalForShellContext.__schoolContextCache = {
          value,
          expiresAt: Date.now() + SCHOOL_CONTEXT_TTL_MS,
        };
        return value;
      })
      .finally(() => {
        globalForShellContext.__schoolContextInflight = undefined;
      });
  }

  return globalForShellContext.__schoolContextInflight;
}

