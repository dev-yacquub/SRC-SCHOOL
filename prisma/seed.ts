import fs from "node:fs";
import path from "node:path";
import {
  Role,
  Gender,
  StudentStatus,
  AttendanceStatus,
  PaymentMethod,
  InvoiceStatus,
  type PrismaClient,
} from "@prisma/client";
import bcrypt from "bcryptjs";

let prisma: PrismaClient;

async function main() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }

  const dbMod = await import("../src/lib/prisma");
  prisma = dbMod.prisma;
  console.log(`Active database provider: ${dbMod.databaseProvider}`);
  const existingAdmin = await prisma.user.findUnique({
    where: { username: "admin" },
  });

  if (existingAdmin) {
    console.log("Database already seeded. Skipping.");
    return;
  }

  console.log("Seeding School Management System database...");
  const passwordHash = await bcrypt.hash("Password123!", 10);

  await prisma.schoolSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      schoolName: "Al-Noor Academy",
      schoolAddress: "Hodan District, Mogadishu",
      schoolPhone: "+252 61 555 0100",
      schoolEmail: "admin@alnoor.edu",
      currency: "USD",
      currencySymbol: "$",
      admissionPrefix: "ADM",
      invoicePrefix: "INV",
      receiptPrefix: "RCT",
    },
  });

  await prisma.gradeScale.createMany({
    data: [
      { minScore: 90, maxScore: 100, grade: "A", remark: "Excellent" },
      { minScore: 80, maxScore: 89.99, grade: "B", remark: "Very Good" },
      { minScore: 70, maxScore: 79.99, grade: "C", remark: "Good" },
      { minScore: 60, maxScore: 69.99, grade: "D", remark: "Satisfactory" },
      { minScore: 50, maxScore: 59.99, grade: "E", remark: "Pass" },
      { minScore: 0, maxScore: 49.99, grade: "F", remark: "Needs Improvement" },
    ],
  });

  const year = await prisma.academicYear.create({
    data: {
      name: "2026-2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-06-30"),
      isCurrent: true,
    },
  });

  const term1 = await prisma.term.create({
    data: {
      academicYearId: year.id,
      name: "Term 1",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-20"),
      isCurrent: true,
    },
  });

  await prisma.term.createMany({
    data: [
      {
        academicYearId: year.id,
        name: "Term 2",
        startDate: new Date("2027-01-05"),
        endDate: new Date("2027-03-25"),
        isCurrent: false,
      },
      {
        academicYearId: year.id,
        name: "Term 3",
        startDate: new Date("2027-04-05"),
        endDate: new Date("2027-06-25"),
        isCurrent: false,
      },
    ],
  });

  const [grade1A, grade1B, grade2A, form1A] = await Promise.all([
    prisma.schoolClass.create({ data: { name: "Grade 1A", level: 1, academicYearId: year.id } }),
    prisma.schoolClass.create({ data: { name: "Grade 1B", level: 1, academicYearId: year.id } }),
    prisma.schoolClass.create({ data: { name: "Grade 2A", level: 2, academicYearId: year.id } }),
    prisma.schoolClass.create({ data: { name: "Form 1A", level: 9, academicYearId: year.id } }),
  ]);

  const [math, english, somali, arabic, science, islamic] = await Promise.all([
    prisma.subject.create({ data: { name: "Mathematics", code: "MATH" } }),
    prisma.subject.create({ data: { name: "English", code: "ENG" } }),
    prisma.subject.create({ data: { name: "Somali", code: "SOM" } }),
    prisma.subject.create({ data: { name: "Arabic", code: "ARB" } }),
    prisma.subject.create({ data: { name: "Science", code: "SCI" } }),
    prisma.subject.create({ data: { name: "Islamic Studies", code: "ISL" } }),
  ]);

  const adminUser = await prisma.user.create({
    data: {
      username: "admin",
      email: "admin@alnoor.edu",
      fullName: "Abdiwahab Hassan",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  await prisma.user.create({
    data: {
      username: "admission",
      email: "admission@alnoor.edu",
      fullName: "Halima Omar",
      passwordHash,
      role: Role.ADMISSION,
    },
  });

  const accountantUser = await prisma.user.create({
    data: {
      username: "accountant",
      email: "accountant@alnoor.edu",
      fullName: "Fartun Ibrahim",
      passwordHash,
      role: Role.ACCOUNTANT,
    },
  });

  const teacherUser1 = await prisma.user.create({
    data: {
      username: "teacher",
      email: "teacher@alnoor.edu",
      fullName: "Mohamed Ali Nur",
      passwordHash,
      role: Role.TEACHER,
    },
  });

  const teacherUser2 = await prisma.user.create({
    data: {
      username: "amina.t",
      email: "amina@alnoor.edu",
      fullName: "Amina Yusuf Warsame",
      passwordHash,
      role: Role.TEACHER,
    },
  });

  const teacher1 = await prisma.teacher.create({
    data: {
      userId: teacherUser1.id,
      fullName: "Mohamed Ali Nur",
      phone: "+252 61 511 2233",
      qualification: "B.Ed Mathematics & Science",
    },
  });

  const teacher2 = await prisma.teacher.create({
    data: {
      userId: teacherUser2.id,
      fullName: "Amina Yusuf Warsame",
      phone: "+252 61 544 7788",
      qualification: "B.A. Languages & Islamic Studies",
    },
  });

  // Class-Subject Assignments
  const csMath1A = await prisma.classSubject.create({
    data: { classId: grade1A.id, subjectId: math.id, teacherId: teacher1.id },
  });
  const csSci1A = await prisma.classSubject.create({
    data: { classId: grade1A.id, subjectId: science.id, teacherId: teacher1.id },
  });
  const csEng1A = await prisma.classSubject.create({
    data: { classId: grade1A.id, subjectId: english.id, teacherId: teacher2.id },
  });
  const csSom1A = await prisma.classSubject.create({
    data: { classId: grade1A.id, subjectId: somali.id, teacherId: teacher2.id },
  });
  const csArb1A = await prisma.classSubject.create({
    data: { classId: grade1A.id, subjectId: arabic.id, teacherId: teacher2.id },
  });
  const csIsl1A = await prisma.classSubject.create({
    data: { classId: grade1A.id, subjectId: islamic.id, teacherId: teacher2.id },
  });

  await prisma.classSubject.createMany({
    data: [
      { classId: grade1B.id, subjectId: math.id, teacherId: teacher1.id },
      { classId: grade1B.id, subjectId: english.id, teacherId: teacher2.id },
      { classId: grade2A.id, subjectId: math.id, teacherId: teacher1.id },
      { classId: grade2A.id, subjectId: science.id, teacherId: teacher1.id },
      { classId: form1A.id, subjectId: math.id, teacherId: teacher1.id },
      { classId: form1A.id, subjectId: english.id, teacherId: teacher2.id },
    ],
  });

  // Timetable for Grade 1A (Saturday=6, Sunday=0, Monday=1, Tuesday=2, Wednesday=3, Thursday=4)
  await prisma.timetableSlot.createMany({
    data: [
      { classSubjectId: csMath1A.id, dayOfWeek: 6, period: 1, startTime: "08:00", endTime: "08:45" },
      { classSubjectId: csEng1A.id, dayOfWeek: 6, period: 2, startTime: "08:50", endTime: "09:35" },
      { classSubjectId: csSci1A.id, dayOfWeek: 6, period: 3, startTime: "09:50", endTime: "10:35" },
      { classSubjectId: csSom1A.id, dayOfWeek: 0, period: 1, startTime: "08:00", endTime: "08:45" },
      { classSubjectId: csMath1A.id, dayOfWeek: 0, period: 2, startTime: "08:50", endTime: "09:35" },
      { classSubjectId: csIsl1A.id, dayOfWeek: 1, period: 1, startTime: "08:00", endTime: "08:45" },
      { classSubjectId: csArb1A.id, dayOfWeek: 1, period: 2, startTime: "08:50", endTime: "09:35" },
      { classSubjectId: csMath1A.id, dayOfWeek: 2, period: 1, startTime: "08:00", endTime: "08:45" },
      { classSubjectId: csSci1A.id, dayOfWeek: 3, period: 1, startTime: "08:00", endTime: "08:45" },
      { classSubjectId: csEng1A.id, dayOfWeek: 4, period: 1, startTime: "08:00", endTime: "08:45" },
    ],
  });

  // Sample students
  const sampleStudents = [
    {
      username: "student",
      admissionNo: "ADM-2026-0001",
      fullName: "Yusuf Ahmed Farah",
      gender: Gender.MALE,
      dob: new Date("2018-04-12"),
      guardianName: "Ahmed Farah Duale",
      guardianPhone: "+252 61 234 5678",
      address: "Hodan, Mogadishu",
      classId: grade1A.id,
    },
    {
      username: "adm-2026-0002",
      admissionNo: "ADM-2026-0002",
      fullName: "Maryan Abdi Hassan",
      gender: Gender.FEMALE,
      dob: new Date("2018-07-19"),
      guardianName: "Abdi Hassan Geedi",
      guardianPhone: "+252 61 345 6789",
      address: "Waberi, Mogadishu",
      classId: grade1A.id,
    },
    {
      username: "adm-2026-0003",
      admissionNo: "ADM-2026-0003",
      fullName: "Khalid Mohamed Osman",
      gender: Gender.MALE,
      dob: new Date("2018-02-03"),
      guardianName: "Mohamed Osman Ali",
      guardianPhone: "+252 61 456 7890",
      address: "Yaqshid, Mogadishu",
      classId: grade1A.id,
    },
    {
      username: "adm-2026-0004",
      admissionNo: "ADM-2026-0004",
      fullName: "Safiya Warsame Noor",
      gender: Gender.FEMALE,
      dob: new Date("2018-11-22"),
      guardianName: "Warsame Noor Shire",
      guardianPhone: "+252 61 567 8901",
      address: "Hamar Weyne, Mogadishu",
      classId: grade1A.id,
    },
    {
      username: "adm-2026-0005",
      admissionNo: "ADM-2026-0005",
      fullName: "Ibrahim Salad Barre",
      gender: Gender.MALE,
      dob: new Date("2018-05-14"),
      guardianName: "Salad Barre Hirsi",
      guardianPhone: "+252 61 678 9012",
      address: "Daynile, Mogadishu",
      classId: grade1B.id,
    },
    {
      username: "adm-2026-0006",
      admissionNo: "ADM-2026-0006",
      fullName: "Hodan Jama Elmi",
      gender: Gender.FEMALE,
      dob: new Date("2017-08-30"),
      guardianName: "Jama Elmi Roble",
      guardianPhone: "+252 61 789 0123",
      address: "Karaan, Mogadishu",
      classId: grade2A.id,
    },
    {
      username: "adm-2026-0007",
      admissionNo: "ADM-2026-0007",
      fullName: "Abdirahman Muse Ghelle",
      gender: Gender.MALE,
      dob: new Date("2012-01-25"),
      guardianName: "Muse Ghelle Isse",
      guardianPhone: "+252 61 890 1234",
      address: "Wadajir, Mogadishu",
      classId: form1A.id,
    },
  ];

  const createdStudents = [];
  for (const s of sampleStudents) {
    const user = await prisma.user.create({
      data: {
        username: s.username,
        fullName: s.fullName,
        passwordHash,
        role: Role.STUDENT,
      },
    });
    const student = await prisma.student.create({
      data: {
        userId: user.id,
        admissionNo: s.admissionNo,
        fullName: s.fullName,
        gender: s.gender,
        dob: s.dob,
        guardianName: s.guardianName,
        guardianPhone: s.guardianPhone,
        address: s.address,
        classId: s.classId,
        status: StudentStatus.ACTIVE,
      },
    });
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        classId: s.classId,
        academicYearId: year.id,
        status: StudentStatus.ACTIVE,
        note: "Initial admission",
      },
    });
    createdStudents.push(student);
  }

  // Attendance for Grade 1A (last 3 days)
  const today = new Date();
  const grade1AStudents = createdStudents.filter((s) => s.classId === grade1A.id);
  for (let offset = 0; offset < 3; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    const dateStr = d.toISOString().slice(0, 10);
    for (let i = 0; i < grade1AStudents.length; i++) {
      const status =
        offset === 1 && i === 2
          ? AttendanceStatus.ABSENT
          : offset === 0 && i === 3
            ? AttendanceStatus.LATE
            : AttendanceStatus.PRESENT;
      await prisma.attendance.create({
        data: {
          studentId: grade1AStudents[i].id,
          classId: grade1A.id,
          date: dateStr,
          status,
          markedById: teacherUser1.id,
        },
      });
    }
  }

  // Exams & Marks
  const midterm = await prisma.exam.create({
    data: {
      termId: term1.id,
      name: "Midterm Exam",
      maxMarks: 100,
      isPublished: true,
      isLocked: true,
    },
  });

  await prisma.exam.create({
    data: {
      termId: term1.id,
      name: "Final Exam",
      maxMarks: 100,
      isPublished: false,
      isLocked: false,
    },
  });

  const subjects1A = [math, science, english, somali, arabic, islamic];
  const sampleScores: Record<string, number[]> = {
    "ADM-2026-0001": [92, 88, 84, 95, 79, 94],
    "ADM-2026-0002": [85, 91, 90, 88, 86, 92],
    "ADM-2026-0003": [74, 68, 72, 80, 65, 78],
    "ADM-2026-0004": [95, 93, 89, 92, 90, 96],
  };

  for (const stu of grade1AStudents) {
    const scores = sampleScores[stu.admissionNo] ?? [80, 80, 80, 80, 80, 80];
    for (let i = 0; i < subjects1A.length; i++) {
      await prisma.mark.create({
        data: {
          examId: midterm.id,
          studentId: stu.id,
          subjectId: subjects1A[i].id,
          classId: grade1A.id,
          score: scores[i],
          enteredById: i < 2 ? teacherUser1.id : teacherUser2.id,
        },
      });
    }
    await prisma.reportRemark.create({
      data: {
        examId: midterm.id,
        studentId: stu.id,
        teacherRemark: "Shows steady focus and positive classroom participation.",
        principalRemark: "Keep up the strong academic effort.",
        updatedById: teacherUser1.id,
      },
    });
  }

  // Fee Structures for Term 1
  for (const cls of [grade1A, grade1B, grade2A]) {
    await prisma.feeStructure.createMany({
      data: [
        { classId: cls.id, termId: term1.id, name: "Tuition Fee", amountCents: 6000 },
        { classId: cls.id, termId: term1.id, name: "Exam Fee", amountCents: 1000 },
      ],
    });
  }
  await prisma.feeStructure.createMany({
    data: [
      { classId: form1A.id, termId: term1.id, name: "Tuition Fee", amountCents: 9000 },
      { classId: form1A.id, termId: term1.id, name: "Exam Fee", amountCents: 1500 },
    ],
  });

  // Invoices & Payments
  for (let i = 0; i < createdStudents.length; i++) {
    const stu = createdStudents[i];
    const isForm = stu.classId === form1A.id;
    const tuition = isForm ? 9000 : 6000;
    const examFee = isForm ? 1500 : 1000;
    const subtotal = tuition + examFee;
    const discount = i === 1 ? 1000 : 0; // Sibling discount for student 2
    const total = subtotal - discount;

    let paidCents = 0;
    let status: InvoiceStatus = InvoiceStatus.UNPAID;
    if (i === 0 || i === 3) {
      paidCents = total;
      status = InvoiceStatus.PAID;
    } else if (i === 1 || i === 4) {
      paidCents = 3000;
      status = InvoiceStatus.PARTIAL;
    }

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo: `INV-2026-${String(i + 1).padStart(4, "0")}`,
        studentId: stu.id,
        termId: term1.id,
        title: `Term 1 Fees - ${stu.fullName}`,
        subtotalCents: subtotal,
        discountCents: discount,
        discountReason: discount > 0 ? "Sibling discount" : null,
        totalCents: total,
        paidCents,
        status,
        dueDate: new Date("2026-10-01"),
        createdById: accountantUser.id,
        items: {
          create: [
            { name: "Tuition Fee", amountCents: tuition },
            { name: "Exam Fee", amountCents: examFee },
          ],
        },
      },
    });

    if (paidCents > 0) {
      const methods: PaymentMethod[] = [
        PaymentMethod.EVC_PLUS,
        PaymentMethod.CASH,
        PaymentMethod.ZAAD,
        PaymentMethod.EDAHAB,
      ];
      await prisma.payment.create({
        data: {
          receiptNo: `RCT-2026-${String(i + 1).padStart(4, "0")}`,
          invoiceId: invoice.id,
          amountCents: paidCents,
          method: methods[i % methods.length],
          reference: i === 0 ? "EVC-992814" : i === 3 ? "EDH-44012" : null,
          receivedById: accountantUser.id,
        },
      });
    }
  }

  // Expenses
  await prisma.expense.createMany({
    data: [
      {
        title: "Classroom Whiteboard Markers & Chalk",
        category: "Supplies",
        amountCents: 4500,
        recordedById: accountantUser.id,
      },
      {
        title: "Electricity & Generator Fuel",
        category: "Utilities",
        amountCents: 18000,
        recordedById: accountantUser.id,
      },
      {
        title: "Exam Paper Printing",
        category: "Academics",
        amountCents: 6500,
        recordedById: accountantUser.id,
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: "SYSTEM_SEEDED",
      entityType: "System",
      entityId: "default",
      details: "Initial seed data created",
    },
  });

  console.log("Seed completed successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });

