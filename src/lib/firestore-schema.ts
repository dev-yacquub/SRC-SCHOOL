export type ModelName =
  | "schoolSettings"
  | "user"
  | "academicYear"
  | "term"
  | "schoolClass"
  | "subject"
  | "teacher"
  | "student"
  | "enrollment"
  | "classSubject"
  | "timetableSlot"
  | "attendance"
  | "examAttendance"
  | "exam"
  | "mark"
  | "reportRemark"
  | "gradeScale"
  | "feeStructure"
  | "invoice"
  | "invoiceItem"
  | "payment"
  | "paymentAllocation"
  | "expense"
  | "auditLog";

export interface RelationDef {
  kind: "belongsTo" | "hasOne" | "hasMany";
  targetModel: ModelName;
  /** For belongsTo: FK field on current model. For hasOne/hasMany: FK field on targetModel. */
  fk: string;
  cascadeDelete?: boolean;
}

export interface ModelDef {
  collection: string;
  fixedId?: string;
  singleUniques?: string[];
  compoundUniques?: Record<string, string[]>;
  defaults?: Record<string, unknown>;
  nowDefaults?: string[];
  hasCreatedAt?: boolean;
  hasUpdatedAt?: boolean;
  relations: Record<string, RelationDef>;
}

export const MODEL_DEFS: Record<ModelName, ModelDef> = {
  schoolSettings: {
    collection: "school_settings",
    fixedId: "default",
    defaults: {
      id: "default",
      schoolName: "SRC Tech School",
      schoolAddress: "",
      schoolPhone: "",
      schoolEmail: "",
      currency: "USD",
      currencySymbol: "$",
      admissionPrefix: "ADM",
      invoicePrefix: "INV",
      receiptPrefix: "RCT",
    },
    hasUpdatedAt: true,
    relations: {},
  },
  user: {
    collection: "users",
    singleUniques: ["username", "email"],
    defaults: {
      email: null,
      isActive: true,
      mustChangePassword: false,
      lastLoginAt: null,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      teacherProfile: {
        kind: "hasOne",
        targetModel: "teacher",
        fk: "userId",
        cascadeDelete: true,
      },
      studentProfile: {
        kind: "hasOne",
        targetModel: "student",
        fk: "userId",
        cascadeDelete: true,
      },
      auditLogs: {
        kind: "hasMany",
        targetModel: "auditLog",
        fk: "userId",
        cascadeDelete: true,
      },
    },
  },
  academicYear: {
    collection: "academic_years",
    singleUniques: ["name"],
    defaults: {
      isCurrent: false,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      terms: {
        kind: "hasMany",
        targetModel: "term",
        fk: "academicYearId",
        cascadeDelete: true,
      },
      classes: {
        kind: "hasMany",
        targetModel: "schoolClass",
        fk: "academicYearId",
        cascadeDelete: true,
      },
      enrollments: {
        kind: "hasMany",
        targetModel: "enrollment",
        fk: "academicYearId",
        cascadeDelete: true,
      },
    },
  },
  term: {
    collection: "terms",
    compoundUniques: {
      academicYearId_name: ["academicYearId", "name"],
    },
    defaults: {
      isCurrent: false,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      academicYear: {
        kind: "belongsTo",
        targetModel: "academicYear",
        fk: "academicYearId",
      },
      exams: {
        kind: "hasMany",
        targetModel: "exam",
        fk: "termId",
        cascadeDelete: true,
      },
      feeStructures: {
        kind: "hasMany",
        targetModel: "feeStructure",
        fk: "termId",
        cascadeDelete: true,
      },
      invoices: {
        kind: "hasMany",
        targetModel: "invoice",
        fk: "termId",
        cascadeDelete: true,
      },
    },
  },
  schoolClass: {
    collection: "classes",
    compoundUniques: {
      academicYearId_name: ["academicYearId", "name"],
    },
    defaults: {
      level: 1,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      academicYear: {
        kind: "belongsTo",
        targetModel: "academicYear",
        fk: "academicYearId",
      },
      students: {
        kind: "hasMany",
        targetModel: "student",
        fk: "classId",
      },
      enrollments: {
        kind: "hasMany",
        targetModel: "enrollment",
        fk: "classId",
        cascadeDelete: true,
      },
      classSubjects: {
        kind: "hasMany",
        targetModel: "classSubject",
        fk: "classId",
        cascadeDelete: true,
      },
      attendance: {
        kind: "hasMany",
        targetModel: "attendance",
        fk: "classId",
        cascadeDelete: true,
      },
      examAttendance: {
        kind: "hasMany",
        targetModel: "examAttendance",
        fk: "classId",
        cascadeDelete: true,
      },
      marks: {
        kind: "hasMany",
        targetModel: "mark",
        fk: "classId",
        cascadeDelete: true,
      },
      feeStructures: {
        kind: "hasMany",
        targetModel: "feeStructure",
        fk: "classId",
        cascadeDelete: true,
      },
    },
  },
  subject: {
    collection: "subjects",
    singleUniques: ["code"],
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      classSubjects: {
        kind: "hasMany",
        targetModel: "classSubject",
        fk: "subjectId",
        cascadeDelete: true,
      },
      examAttendance: {
        kind: "hasMany",
        targetModel: "examAttendance",
        fk: "subjectId",
        cascadeDelete: true,
      },
      marks: {
        kind: "hasMany",
        targetModel: "mark",
        fk: "subjectId",
        cascadeDelete: true,
      },
    },
  },
  teacher: {
    collection: "teachers",
    singleUniques: ["userId"],
    defaults: {
      phone: null,
      qualification: null,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      user: {
        kind: "belongsTo",
        targetModel: "user",
        fk: "userId",
      },
      classSubjects: {
        kind: "hasMany",
        targetModel: "classSubject",
        fk: "teacherId",
        cascadeDelete: true,
      },
    },
  },
  student: {
    collection: "students",
    singleUniques: ["userId", "admissionNo"],
    defaults: {
      dob: null,
      photo: null,
      address: null,
      previousSchool: null,
      usesBus: false,
      busFeeCents: null,
      status: "ACTIVE",
      statusReason: null,
      statusUpdatedAt: null,
    },
    nowDefaults: ["admissionDate"],
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      user: {
        kind: "belongsTo",
        targetModel: "user",
        fk: "userId",
      },
      class: {
        kind: "belongsTo",
        targetModel: "schoolClass",
        fk: "classId",
      },
      enrollments: {
        kind: "hasMany",
        targetModel: "enrollment",
        fk: "studentId",
        cascadeDelete: true,
      },
      attendance: {
        kind: "hasMany",
        targetModel: "attendance",
        fk: "studentId",
        cascadeDelete: true,
      },
      examAttendance: {
        kind: "hasMany",
        targetModel: "examAttendance",
        fk: "studentId",
        cascadeDelete: true,
      },
      marks: {
        kind: "hasMany",
        targetModel: "mark",
        fk: "studentId",
        cascadeDelete: true,
      },
      reportRemarks: {
        kind: "hasMany",
        targetModel: "reportRemark",
        fk: "studentId",
        cascadeDelete: true,
      },
      invoices: {
        kind: "hasMany",
        targetModel: "invoice",
        fk: "studentId",
        cascadeDelete: true,
      },
    },
  },
  enrollment: {
    collection: "student_enrollments",
    defaults: {
      status: "ACTIVE",
      note: null,
    },
    nowDefaults: ["enrolledAt"],
    relations: {
      student: {
        kind: "belongsTo",
        targetModel: "student",
        fk: "studentId",
      },
      class: {
        kind: "belongsTo",
        targetModel: "schoolClass",
        fk: "classId",
      },
      academicYear: {
        kind: "belongsTo",
        targetModel: "academicYear",
        fk: "academicYearId",
      },
    },
  },
  classSubject: {
    collection: "class_subjects",
    compoundUniques: {
      classId_subjectId: ["classId", "subjectId"],
    },
    hasCreatedAt: true,
    relations: {
      class: {
        kind: "belongsTo",
        targetModel: "schoolClass",
        fk: "classId",
      },
      subject: {
        kind: "belongsTo",
        targetModel: "subject",
        fk: "subjectId",
      },
      teacher: {
        kind: "belongsTo",
        targetModel: "teacher",
        fk: "teacherId",
      },
      timetable: {
        kind: "hasMany",
        targetModel: "timetableSlot",
        fk: "classSubjectId",
        cascadeDelete: true,
      },
    },
  },
  timetableSlot: {
    collection: "timetable",
    compoundUniques: {
      classSubjectId_dayOfWeek_period: ["classSubjectId", "dayOfWeek", "period"],
    },
    relations: {
      classSubject: {
        kind: "belongsTo",
        targetModel: "classSubject",
        fk: "classSubjectId",
      },
    },
  },
  attendance: {
    collection: "attendance",
    compoundUniques: {
      studentId_date_shift: ["studentId", "date", "shift"],
    },
    defaults: {
      shift: "SHIFT_A",
      note: null,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      student: {
        kind: "belongsTo",
        targetModel: "student",
        fk: "studentId",
      },
      class: {
        kind: "belongsTo",
        targetModel: "schoolClass",
        fk: "classId",
      },
    },
  },
  examAttendance: {
    collection: "exam_attendance",
    compoundUniques: {
      studentId_date_examKey_subjectId: [
        "studentId",
        "date",
        "examKey",
        "subjectId",
      ],
    },
    defaults: {
      examId: null,
      examKey: "",
      note: null,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      exam: {
        kind: "belongsTo",
        targetModel: "exam",
        fk: "examId",
      },
      class: {
        kind: "belongsTo",
        targetModel: "schoolClass",
        fk: "classId",
      },
      subject: {
        kind: "belongsTo",
        targetModel: "subject",
        fk: "subjectId",
      },
      student: {
        kind: "belongsTo",
        targetModel: "student",
        fk: "studentId",
      },
    },
  },
  exam: {
    collection: "exams",
    compoundUniques: {
      termId_name: ["termId", "name"],
    },
    defaults: {
      maxMarks: 100,
      isPublished: false,
      isLocked: false,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      term: {
        kind: "belongsTo",
        targetModel: "term",
        fk: "termId",
      },
      marks: {
        kind: "hasMany",
        targetModel: "mark",
        fk: "examId",
        cascadeDelete: true,
      },
      reportRemarks: {
        kind: "hasMany",
        targetModel: "reportRemark",
        fk: "examId",
        cascadeDelete: true,
      },
      examAttendance: {
        kind: "hasMany",
        targetModel: "examAttendance",
        fk: "examId",
        cascadeDelete: true,
      },
    },
  },
  mark: {
    collection: "marks",
    compoundUniques: {
      examId_studentId_subjectId: ["examId", "studentId", "subjectId"],
    },
    defaults: {
      remark: null,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      exam: {
        kind: "belongsTo",
        targetModel: "exam",
        fk: "examId",
      },
      student: {
        kind: "belongsTo",
        targetModel: "student",
        fk: "studentId",
      },
      subject: {
        kind: "belongsTo",
        targetModel: "subject",
        fk: "subjectId",
      },
      class: {
        kind: "belongsTo",
        targetModel: "schoolClass",
        fk: "classId",
      },
    },
  },
  reportRemark: {
    collection: "report_remarks",
    compoundUniques: {
      examId_studentId: ["examId", "studentId"],
    },
    defaults: {
      teacherRemark: null,
      principalRemark: null,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      exam: {
        kind: "belongsTo",
        targetModel: "exam",
        fk: "examId",
      },
      student: {
        kind: "belongsTo",
        targetModel: "student",
        fk: "studentId",
      },
    },
  },
  gradeScale: {
    collection: "grade_scale",
    relations: {},
  },
  feeStructure: {
    collection: "fee_structures",
    compoundUniques: {
      classId_termId_name: ["classId", "termId", "name"],
    },
    defaults: {
      isBusFee: false,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      class: {
        kind: "belongsTo",
        targetModel: "schoolClass",
        fk: "classId",
      },
      term: {
        kind: "belongsTo",
        targetModel: "term",
        fk: "termId",
      },
      invoiceItems: {
        kind: "hasMany",
        targetModel: "invoiceItem",
        fk: "feeStructureId",
      },
      paymentAllocations: {
        kind: "hasMany",
        targetModel: "paymentAllocation",
        fk: "feeStructureId",
      },
    },
  },
  invoice: {
    collection: "invoices",
    singleUniques: ["invoiceNo"],
    defaults: {
      discountCents: 0,
      discountReason: null,
      paidCents: 0,
      status: "UNPAID",
      dueDate: null,
    },
    hasCreatedAt: true,
    hasUpdatedAt: true,
    relations: {
      student: {
        kind: "belongsTo",
        targetModel: "student",
        fk: "studentId",
      },
      term: {
        kind: "belongsTo",
        targetModel: "term",
        fk: "termId",
      },
      items: {
        kind: "hasMany",
        targetModel: "invoiceItem",
        fk: "invoiceId",
        cascadeDelete: true,
      },
      payments: {
        kind: "hasMany",
        targetModel: "payment",
        fk: "invoiceId",
        cascadeDelete: true,
      },
    },
  },
  invoiceItem: {
    collection: "invoice_items",
    defaults: {
      feeStructureId: null,
    },
    relations: {
      invoice: {
        kind: "belongsTo",
        targetModel: "invoice",
        fk: "invoiceId",
      },
      feeStructure: {
        kind: "belongsTo",
        targetModel: "feeStructure",
        fk: "feeStructureId",
      },
      allocations: {
        kind: "hasMany",
        targetModel: "paymentAllocation",
        fk: "invoiceItemId",
      },
    },
  },
  payment: {
    collection: "payments",
    singleUniques: ["receiptNo"],
    defaults: {
      reference: null,
      note: null,
    },
    nowDefaults: ["paidAt"],
    hasCreatedAt: true,
    relations: {
      invoice: {
        kind: "belongsTo",
        targetModel: "invoice",
        fk: "invoiceId",
      },
      allocations: {
        kind: "hasMany",
        targetModel: "paymentAllocation",
        fk: "paymentId",
        cascadeDelete: true,
      },
    },
  },
  paymentAllocation: {
    collection: "payment_allocations",
    defaults: {
      invoiceItemId: null,
      feeStructureId: null,
    },
    relations: {
      payment: {
        kind: "belongsTo",
        targetModel: "payment",
        fk: "paymentId",
      },
      invoiceItem: {
        kind: "belongsTo",
        targetModel: "invoiceItem",
        fk: "invoiceItemId",
      },
      feeStructure: {
        kind: "belongsTo",
        targetModel: "feeStructure",
        fk: "feeStructureId",
      },
    },
  },
  expense: {
    collection: "expenses",
    defaults: {
      category: "General",
      note: null,
    },
    nowDefaults: ["date"],
    hasCreatedAt: true,
    relations: {},
  },
  auditLog: {
    collection: "audit_logs",
    defaults: {
      details: null,
    },
    hasCreatedAt: true,
    relations: {
      user: {
        kind: "belongsTo",
        targetModel: "user",
        fk: "userId",
      },
    },
  },
};

export const ALL_MODELS = Object.keys(MODEL_DEFS) as ModelName[];

