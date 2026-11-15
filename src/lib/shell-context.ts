import { prisma } from "./prisma";

export async function getSchoolContext() {
  const [settings, currentYear, currentTerm] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { id: "default" } }),
    prisma.academicYear.findFirst({ where: { isCurrent: true } }),
    prisma.term.findFirst({ where: { isCurrent: true } }),
  ]);

  const schoolName =
    settings?.schoolName || process.env.SCHOOL_NAME || "School Management System";
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

