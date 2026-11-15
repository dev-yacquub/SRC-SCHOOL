import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import {
  generateTemporaryPassword,
  hashPassword,
  requireApiRole,
} from "@/lib/auth";
import { generateSequenceCode } from "@/lib/domain";
import { logAudit } from "@/lib/audit";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_IMPORT_ROWS = 200;

export async function GET() {
  const { error } = await requireApiRole(["ADMISSION", "ADMIN"]);
  if (error) return error;

  const classes = await prisma.schoolClass.findMany({
    orderBy: [{ level: "asc" }, { name: "asc" }],
    select: { name: true },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Students");
  sheet.columns = [
    { header: "Full Name", key: "fullName", width: 26 },
    { header: "Gender (MALE/FEMALE)", key: "gender", width: 20 },
    { header: "Date of Birth (YYYY-MM-DD)", key: "dob", width: 24 },
    { header: "Guardian Name", key: "guardianName", width: 24 },
    { header: "Guardian Phone", key: "guardianPhone", width: 18 },
    { header: "Address", key: "address", width: 24 },
    { header: "Previous School", key: "previousSchool", width: 22 },
    { header: "Class Name", key: "className", width: 16 },
    { header: "Admission Date (YYYY-MM-DD)", key: "admissionDate", width: 24 },
    { header: "Uses Bus (YES/NO)", key: "usesBus", width: 18 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    fullName: "Example Student Name",
    gender: "MALE",
    dob: "2018-01-15",
    guardianName: "Example Guardian Name",
    guardianPhone: "+000 00 000 0000",
    address: "Street, City",
    previousSchool: "Previous School Name",
    className: classes[0]?.name ?? "Class Name",
    admissionDate: new Date().toISOString().slice(0, 10),
    usesBus: "NO",
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="student_import_template.xlsx"',
    },
  });
}

function parseExcelDate(val: ExcelJS.CellValue): Date | null {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    // Excel serial date
    const utcDays = Math.floor(val - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const str = String(val).trim();
  if (!str) return null;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(req: Request) {
  const { user, error } = await requireApiRole(["ADMISSION", "ADMIN"]);
  if (error || !user) return error;

  const { searchParams } = new URL(req.url);
  const isPreview = searchParams.get("preview") === "true";

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Please upload an Excel (.xlsx) file" },
        { status: 400 }
      );
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Only .xlsx Excel files are supported" },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Excel file must be 5 MB or smaller" },
        { status: 400 }
      );
    }

    const workbook = new ExcelJS.Workbook();
    const buf = await file.arrayBuffer();
    await workbook.xlsx.load(buf);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json(
        { error: "No worksheet found in file" },
        { status: 400 }
      );
    }
    if (sheet.rowCount > MAX_IMPORT_ROWS + 1) {
      return NextResponse.json(
        {
          error: `Spreadsheet exceeds maximum of ${MAX_IMPORT_ROWS} rows per import`,
        },
        { status: 400 }
      );
    }

    const classes = await prisma.schoolClass.findMany();
    const classByName = new Map(
      classes.map((c) => [c.name.trim().toLowerCase(), c])
    );

    const rowsToInsert: {
      rowNumber: number;
      fullName: string;
      gender: "MALE" | "FEMALE";
      dob: Date | null;
      guardianName: string;
      guardianPhone: string;
      address: string | null;
      previousSchool: string | null;
      classId: string;
      className: string;
      academicYearId: string;
      admissionDate: Date;
      usesBus: boolean;
    }[] = [];
    const errors: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const fullName = String(row.getCell(1).value ?? "").trim().slice(0, 100);
      if (!fullName) return;

      const genderRaw = String(row.getCell(2).value ?? "MALE")
        .trim()
        .toUpperCase();
      const gender: "MALE" | "FEMALE" =
        genderRaw === "FEMALE" || genderRaw === "F" ? "FEMALE" : "MALE";

      const dob = parseExcelDate(row.getCell(3).value);
      const guardianName = String(row.getCell(4).value ?? "").trim().slice(0, 100);
      const guardianPhone = String(row.getCell(5).value ?? "").trim().slice(0, 30);
      const address =
        String(row.getCell(6).value ?? "").trim().slice(0, 200) || null;
      const previousSchool =
        String(row.getCell(7).value ?? "").trim().slice(0, 120) || null;
      const classNameRaw = String(row.getCell(8).value ?? "").trim();
      const admissionDate = parseExcelDate(row.getCell(9).value) ?? new Date();
      const usesBusRaw = String(row.getCell(10).value ?? "")
        .trim()
        .toUpperCase();
      const usesBus =
        usesBusRaw === "YES" || usesBusRaw === "Y" || usesBusRaw === "TRUE" || usesBusRaw === "1";

      if (fullName.length < 2) {
        errors.push(`Row ${rowNumber}: Student full name is too short.`);
        return;
      }
      if (guardianName.length < 2 || guardianPhone.length < 5) {
        errors.push(
          `Row ${rowNumber} (${fullName}): Valid guardian name and phone are required.`
        );
        return;
      }

      const cls = classByName.get(classNameRaw.toLowerCase());
      if (!cls) {
        errors.push(
          `Row ${rowNumber} (${fullName}): Unknown class "${classNameRaw || "(blank)"}".`
        );
        return;
      }

      rowsToInsert.push({
        rowNumber,
        fullName,
        gender,
        dob,
        guardianName,
        guardianPhone,
        address,
        previousSchool,
        classId: cls.id,
        className: cls.name,
        academicYearId: cls.academicYearId,
        admissionDate,
        usesBus,
      });
    });

    if (isPreview) {
      return NextResponse.json({
        preview: true,
        validCount: rowsToInsert.length,
        errors,
        validRows: rowsToInsert.map((r) => ({
          rowNumber: r.rowNumber,
          fullName: r.fullName,
          gender: r.gender,
          dob: r.dob ? r.dob.toISOString().slice(0, 10) : null,
          guardianName: r.guardianName,
          guardianPhone: r.guardianPhone,
          className: r.className,
          admissionDate: r.admissionDate.toISOString().slice(0, 10),
        })),
      });
    }

    if (rowsToInsert.length === 0) {
      return NextResponse.json(
        { error: errors[0] ?? "No valid rows found in spreadsheet", errors },
        { status: 400 }
      );
    }

    const settings = await prisma.schoolSettings.findUnique({
      where: { id: "default" },
    });
    const prefix = settings?.admissionPrefix ?? "ADM";
    const year = new Date().getFullYear();

    // Generate a unique random temporary password per imported student
    const preparedCredentials = await Promise.all(
      rowsToInsert.map(async () => {
        const temporaryPassword = generateTemporaryPassword();
        const passwordHash = await hashPassword(temporaryPassword);
        return { temporaryPassword, passwordHash };
      })
    );

    const createdAccounts = await prisma.$transaction(async (tx) => {
      let seq = (await tx.student.count()) + 1;
      const accounts: {
        id: string;
        admissionNo: string;
        fullName: string;
        className: string;
        username: string;
        temporaryPassword: string;
      }[] = [];

      for (let idx = 0; idx < rowsToInsert.length; idx++) {
        const item = rowsToInsert[idx];
        const cred = preparedCredentials[idx];
        let admissionNo = generateSequenceCode(prefix, year, seq);
        while (await tx.student.findUnique({ where: { admissionNo } })) {
          seq++;
          admissionNo = generateSequenceCode(prefix, year, seq);
        }
        seq++;

        const username = admissionNo.toLowerCase();
        const u = await tx.user.create({
          data: {
            username,
            fullName: item.fullName,
            passwordHash: cred.passwordHash,
            role: "STUDENT",
            mustChangePassword: true,
          },
        });
        const stu = await tx.student.create({
          data: {
            userId: u.id,
            admissionNo,
            fullName: item.fullName,
            gender: item.gender,
            dob: item.dob,
            guardianName: item.guardianName,
            guardianPhone: item.guardianPhone,
            address: item.address,
            previousSchool: item.previousSchool,
            classId: item.classId,
            admissionDate: item.admissionDate,
            usesBus: item.usesBus,
          },
        });
        await tx.enrollment.create({
          data: {
            studentId: stu.id,
            classId: item.classId,
            academicYearId: item.academicYearId,
            status: "ACTIVE",
            enrolledAt: item.admissionDate,
            note: "Bulk Excel import",
          },
        });
        accounts.push({
          id: stu.id,
          admissionNo,
          fullName: item.fullName,
          className: item.className,
          username,
          temporaryPassword: cred.temporaryPassword,
        });
      }

      return accounts;
    });

    await logAudit({
      userId: user.userId,
      action: "STUDENTS_BULK_IMPORTED",
      entityType: "Student",
      entityId: "bulk",
      details: { count: createdAccounts.length },
    });

    return NextResponse.json({
      importedCount: createdAccounts.length,
      defaultPassword: "Unique per student (see table)",
      createdAccounts,
      errors,
    });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json(
      { error: "Failed to parse or import Excel file" },
      { status: 500 }
    );
  }
}
