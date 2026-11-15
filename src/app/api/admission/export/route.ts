import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireApiRole } from "@/lib/auth";

const VALID_STATUSES = new Set([
  "ACTIVE",
  "TRANSFERRED",
  "WITHDRAWN",
  "GRADUATED",
]);
const VALID_GENDERS = new Set(["MALE", "FEMALE"]);

export async function GET(req: Request) {
  const { error } = await requireApiRole(["ADMISSION", "ADMIN", "ACCOUNTANT"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase().slice(0, 100) ?? "";
  const classId = searchParams.get("classId") ?? "";
  const statusRaw = searchParams.get("status") ?? "";
  const genderRaw = searchParams.get("gender") ?? "";
  const status = VALID_STATUSES.has(statusRaw) ? statusRaw : "";
  const gender = VALID_GENDERS.has(genderRaw) ? genderRaw : "";

  const students = await prisma.student.findMany({
    where: {
      ...(classId ? { classId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(gender ? { gender: gender as never } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q } },
              { admissionNo: { contains: q } },
              { guardianName: { contains: q } },
              { guardianPhone: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      class: { select: { name: true, academicYear: { select: { name: true } } } },
      user: { select: { username: true, isActive: true } },
    },
    orderBy: [{ class: { level: "asc" } }, { fullName: "asc" }],
    take: 1000,
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Student Directory");
  sheet.columns = [
    { header: "Admission No", key: "admissionNo", width: 16 },
    { header: "Full Name", key: "fullName", width: 26 },
    { header: "Username", key: "username", width: 18 },
    { header: "Gender", key: "gender", width: 10 },
    { header: "Date of Birth", key: "dob", width: 14 },
    { header: "Class", key: "className", width: 14 },
    { header: "Academic Year", key: "year", width: 14 },
    { header: "Guardian Name", key: "guardianName", width: 24 },
    { header: "Guardian Phone", key: "guardianPhone", width: 18 },
    { header: "Address", key: "address", width: 24 },
    { header: "Previous School", key: "previousSchool", width: 20 },
    { header: "School Bus", key: "usesBus", width: 12 },
    { header: "Status", key: "status", width: 14 },
    { header: "Admission Date", key: "admissionDate", width: 15 },
    { header: "Login Active", key: "loginActive", width: 12 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const s of students) {
    sheet.addRow({
      admissionNo: s.admissionNo,
      fullName: s.fullName,
      username: s.user.username,
      gender: s.gender,
      dob: s.dob ? s.dob.toISOString().slice(0, 10) : "",
      className: s.class.name,
      year: s.class.academicYear.name,
      guardianName: s.guardianName,
      guardianPhone: s.guardianPhone,
      address: s.address ?? "",
      previousSchool: s.previousSchool ?? "",
      usesBus: s.usesBus ? "Yes" : "No",
      status: s.status,
      admissionDate: s.admissionDate.toISOString().slice(0, 10),
      loginActive: s.user.isActive ? "Yes" : "No",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="students_directory.xlsx"',
    },
  });
}

