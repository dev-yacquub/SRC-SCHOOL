import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";
import {
  filterAttendanceSearchStudents,
  getMonthlyAbsenceStats,
  getStudentClassJoinedTimestampMap,
  parseYearMonth,
  summarizeAttendance,
} from "@/lib/domain";

type AttendanceStatus = "PRESENT" | "ABSENT";

const normalizeStatus = (s: string): AttendanceStatus =>
  s === "ABSENT" ? "ABSENT" : "PRESENT";

export async function GET(req: Request) {
  const { user, error } = await requireApiRole(["TEACHER", "ADMIN"]);
  if (error || !user) return error;

  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const rawDate = searchParams.get("date") ?? "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : new Date().toISOString().slice(0, 10);
    const monthInfo = parseYearMonth(searchParams.get("month"));
    const rawLimit = Number(searchParams.get("limit") ?? 30);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(50, Math.max(1, Math.trunc(rawLimit)))
      : 30;

    let classes: { id: string; name: string; level: number }[] = [];
    if (user.role === "ADMIN") {
      classes = await prisma.schoolClass.findMany({
        orderBy: [{ level: "asc" }, { name: "asc" }],
        select: { id: true, name: true, level: true },
      });
    } else {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: user.userId },
        select: { id: true },
      });
      if (!teacher) {
        return NextResponse.json(
          { error: "Teacher profile missing" },
          { status: 404 }
        );
      }
      const assignments = await prisma.classSubject.findMany({
        where: { teacherId: teacher.id },
        include: {
          class: { select: { id: true, name: true, level: true } },
        },
        orderBy: [{ class: { level: "asc" } }, { class: { name: "asc" } }],
      });
      classes = Array.from(
        new Map(
          assignments.flatMap((a) =>
            a.class ? [[a.class.id, a.class] as const] : []
          )
        ).values()
      );
    }

    if (!q || classes.length === 0) {
      return NextResponse.json({
        query: q,
        date,
        month: monthInfo.ym,
        monthLabel: monthInfo.label,
        totalMatches: 0,
        results: [],
      });
    }

    const classMap = new Map(classes.map((c) => [c.id, c]));
    const allowedClassIds = classes.map((c) => c.id);

    const [activeStudents, enrollments] = await Promise.all([
      prisma.student.findMany({
        where: {
          classId: { in: allowedClassIds },
          status: "ACTIVE",
        },
        orderBy: [{ createdAt: "asc" }, { admissionNo: "asc" }, { id: "asc" }],
        select: {
          id: true,
          admissionNo: true,
          fullName: true,
          gender: true,
          classId: true,
          guardianPhone: true,
          createdAt: true,
        },
      }),
      prisma.enrollment.findMany({
        where: { classId: { in: allowedClassIds } },
        select: { studentId: true, classId: true, enrolledAt: true },
      }),
    ]);

    const joinedAtMap = getStudentClassJoinedTimestampMap(
      activeStudents,
      enrollments
    );

    const candidates = activeStudents.flatMap((s) => {
      const cls = classMap.get(s.classId);
      if (!cls) return [];
      return [
        {
          id: s.id,
          admissionNo: s.admissionNo,
          fullName: s.fullName,
          gender: s.gender,
          classId: s.classId,
          className: cls.name,
          classLevel: cls.level,
          guardianPhone: s.guardianPhone,
          createdAt: s.createdAt,
          joinedClassAt: joinedAtMap.get(s.id) ?? s.createdAt,
        },
      ];
    });

    const { totalMatches, matches } = filterAttendanceSearchStudents(
      candidates,
      q,
      limit
    );

    if (matches.length === 0) {
      return NextResponse.json({
        query: q,
        date,
        month: monthInfo.ym,
        monthLabel: monthInfo.label,
        totalMatches: 0,
        results: [],
      });
    }

    const matchedIds = matches.map((m) => m.id);

    const [dailyRecords, monthlyRecords, punishments] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          studentId: { in: matchedIds },
          date,
        },
        select: {
          studentId: true,
          shift: true,
          status: true,
        },
      }),
      prisma.attendance.findMany({
        where: {
          studentId: { in: matchedIds },
          date: { startsWith: `${monthInfo.ym}-` },
        },
        select: {
          studentId: true,
          date: true,
          status: true,
        },
      }),
      prisma.attendancePunishment.findMany({
        where: {
          studentId: { in: matchedIds },
          month: monthInfo.ym,
        },
        select: { studentId: true },
      }),
    ]);

    const dailyMap = new Map<
      string,
      { shiftA: AttendanceStatus | null; shiftB: AttendanceStatus | null }
    >();
    for (const r of dailyRecords) {
      const cur = dailyMap.get(r.studentId) ?? { shiftA: null, shiftB: null };
      if (r.shift === "SHIFT_B") {
        cur.shiftB = normalizeStatus(r.status);
      } else {
        cur.shiftA = normalizeStatus(r.status);
      }
      dailyMap.set(r.studentId, cur);
    }

    const monthlyByStudent = new Map<
      string,
      { date: string; status: string }[]
    >();
    for (const r of monthlyRecords) {
      const arr = monthlyByStudent.get(r.studentId) ?? [];
      arr.push(r);
      monthlyByStudent.set(r.studentId, arr);
    }

    const punishedIds = new Set(punishments.map((p) => p.studentId));

    const results = matches.map((s) => {
      const daily = dailyMap.get(s.id) ?? { shiftA: null, shiftB: null };
      const monthRecs = monthlyByStudent.get(s.id) ?? [];
      const summary = summarizeAttendance(monthRecs);
      const absenceStats = getMonthlyAbsenceStats(monthRecs);
      const isPunished = punishedIds.has(s.id);
      const needsPunishmentHighlight =
        absenceStats.meetsAbsenceThreshold && !isPunished;

      return {
        studentId: s.id,
        admissionNo: s.admissionNo,
        fullName: s.fullName,
        gender: s.gender,
        classId: s.classId,
        className: s.className,
        classLevel: s.classLevel,
        daily,
        monthly: {
          ...summary,
          absentDays: absenceStats.absentDays,
          absentShifts: absenceStats.absentShifts,
          isPunished,
          needsPunishmentHighlight,
        },
      };
    });

    return NextResponse.json({
      query: q,
      date,
      month: monthInfo.ym,
      monthLabel: monthInfo.label,
      totalMatches,
      results,
    });
  } catch (err) {
    console.error("[GET /api/teacher/attendance/search] failed:", err);
    return NextResponse.json(
      { error: "Failed to search attendance" },
      { status: 500 }
    );
  }
}

