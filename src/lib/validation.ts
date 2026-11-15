import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

export const initialSetupSchema = z.object({
  schoolName: z.string().trim().min(2, "School name is required").max(120),
  schoolAddress: z.string().trim().max(200).optional().or(z.literal("")),
  schoolPhone: z.string().trim().max(40).optional().or(z.literal("")),
  schoolEmail: z.string().trim().email().optional().or(z.literal("")),
  currency: z.string().trim().min(2).max(10).default("USD"),
  currencySymbol: z.string().trim().min(1).max(5).default("$"),
  fullName: z.string().trim().min(2, "Admin full name is required").max(100),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Only letters, numbers, dot, underscore, hyphen"),
  email: z.string().trim().email().optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters"),
  includeDefaultGradeScale: z.boolean().optional().default(true),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Only letters, numbers, dot, underscore, hyphen"),
  email: z.string().trim().email().optional().or(z.literal("")),
  fullName: z.string().trim().min(2).max(100),
  role: z.enum(["ADMIN", "ADMISSION", "TEACHER", "ACCOUNTANT"]),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  qualification: z.string().trim().max(100).optional().or(z.literal("")),
});

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  role: z.enum(["ADMIN", "ADMISSION", "TEACHER", "ACCOUNTANT", "STUDENT"]).optional(),
  isActive: z.boolean().optional(),
  resetPassword: z.string().min(6).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  qualification: z.string().trim().max(100).optional().or(z.literal("")),
});

export const academicYearSchema = z.object({
  name: z.string().trim().min(4).max(30),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isCurrent: z.boolean().optional(),
});

export const termSchema = z.object({
  academicYearId: z.string().min(1),
  name: z.string().trim().min(2).max(40),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isCurrent: z.boolean().optional(),
});

export const classSchema = z.object({
  name: z.string().trim().min(2).max(40),
  level: z.coerce.number().int().min(1).max(20),
  academicYearId: z.string().min(1),
});

export const subjectSchema = z.object({
  name: z.string().trim().min(2).max(60),
  code: z.string().trim().min(2).max(20).toUpperCase(),
});

export const classSubjectSchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
});

export const timetableSlotSchema = z.object({
  classSubjectId: z.string().min(1),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  period: z.coerce.number().int().min(1).max(10),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
});

export const studentCreateSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  gender: z.enum(["MALE", "FEMALE"]),
  dob: z.string().optional().or(z.literal("")),
  photo: z.string().optional().or(z.literal("")),
  guardianName: z.string().trim().min(2).max(100),
  guardianPhone: z.string().trim().min(5).max(30),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  previousSchool: z.string().trim().max(120).optional().or(z.literal("")),
  classId: z.string().min(1),
  admissionDate: z.string().optional().or(z.literal("")),
});

export const studentUpdateSchema = studentCreateSchema.partial().extend({
  status: z.enum(["ACTIVE", "TRANSFERRED", "WITHDRAWN", "GRADUATED"]).optional(),
  statusReason: z.string().trim().max(250).optional().or(z.literal("")),
});

export const studentAccountActionSchema = z.object({
  action: z.enum(["toggleActive", "resetPassword"]),
  isActive: z.boolean().optional(),
  newPassword: z.string().min(6, "Password must be at least 6 characters").optional().or(z.literal("")),
});

export const promoteStudentsSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1, "Select at least one student"),
  targetClassId: z.string().optional().or(z.literal("")),
  markGraduated: z.boolean().default(false),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export const attendanceBatchSchema = z.object({
  classId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(
    z.object({
      studentId: z.string().min(1),
      status: z.enum(["PRESENT", "ABSENT", "LATE"]),
      note: z.string().max(120).optional().or(z.literal("")),
    })
  ),
});

export const examCreateSchema = z.object({
  termId: z.string().min(1),
  name: z.string().trim().min(2).max(60),
  maxMarks: z.coerce.number().positive().max(1000),
});

export const marksBatchSchema = z.object({
  examId: z.string().min(1),
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  entries: z.array(
    z.object({
      studentId: z.string().min(1),
      score: z.coerce.number().min(0),
      remark: z.string().max(120).optional().or(z.literal("")),
    })
  ),
  clearStudentIds: z.array(z.string().min(1)).optional(),
});

export const reportRemarksBatchSchema = z.object({
  examId: z.string().min(1),
  classId: z.string().min(1),
  remarks: z.array(
    z.object({
      studentId: z.string().min(1),
      teacherRemark: z.string().trim().max(300).optional().or(z.literal("")),
      principalRemark: z.string().trim().max(300).optional().or(z.literal("")),
    })
  ),
});

export const gradeScaleUpdateSchema = z.object({
  scales: z.array(
    z.object({
      minScore: z.coerce.number().min(0).max(100),
      maxScore: z.coerce.number().min(0).max(100),
      grade: z.string().trim().min(1).max(5),
      remark: z.string().trim().min(1).max(40),
    })
  ),
});

export const feeStructureSchema = z.object({
  classId: z.string().min(1),
  termId: z.string().min(1),
  name: z.string().trim().min(2).max(60),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
});

export const generateInvoicesSchema = z.object({
  termId: z.string().min(1),
  classId: z.string().optional().or(z.literal("")),
  studentId: z.string().optional().or(z.literal("")),
  discountAmount: z.coerce.number().min(0).default(0),
  discountReason: z.string().trim().max(100).optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive("Payment amount must be greater than 0"),
  method: z.enum(["CASH", "EVC_PLUS", "ZAAD", "EDAHAB", "BANK"]),
  reference: z.string().trim().max(80).optional().or(z.literal("")),
  note: z.string().trim().max(150).optional().or(z.literal("")),
  paidAt: z.string().optional().or(z.literal("")),
});

export const expenseSchema = z.object({
  title: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(50).default("General"),
  amount: z.coerce.number().positive(),
  date: z.string().optional().or(z.literal("")),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export const settingsSchema = z.object({
  schoolName: z.string().trim().min(2).max(100),
  schoolAddress: z.string().trim().max(150),
  schoolPhone: z.string().trim().max(40),
  schoolEmail: z.string().trim().email(),
  currency: z.string().trim().min(2).max(10),
  currencySymbol: z.string().trim().min(1).max(5),
  admissionPrefix: z.string().trim().min(2).max(10).toUpperCase(),
  invoicePrefix: z.string().trim().min(2).max(10).toUpperCase(),
  receiptPrefix: z.string().trim().min(2).max(10).toUpperCase(),
});

