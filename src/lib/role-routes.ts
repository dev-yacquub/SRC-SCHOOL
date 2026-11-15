export type AppRole = "ADMIN" | "ADMISSION" | "TEACHER" | "STUDENT" | "ACCOUNTANT";

export type NavItem = {
  label: string;
  href: string;
  icon: string;
  section?: string;
};

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Administrator (Full Access)",
  ADMISSION: "Admission Officer",
  TEACHER: "Teacher",
  STUDENT: "Student",
  ACCOUNTANT: "Accountant",
};

export const ROLE_HOME: Record<AppRole, string> = {
  ADMIN: "/admin",
  ADMISSION: "/admission",
  TEACHER: "/teacher",
  STUDENT: "/student",
  ACCOUNTANT: "/accountant",
};

export const ROLE_NAV: Record<AppRole, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard", href: "/admin", icon: "LayoutDashboard", section: "Administration" },
    { label: "Users", href: "/admin/users", icon: "Users", section: "Administration" },
    { label: "Classes & Subjects", href: "/admin/academics", icon: "BookOpen", section: "Administration" },
    { label: "Timetable", href: "/admin/timetable", icon: "CalendarDays", section: "Administration" },
    { label: "Exams & Results", href: "/admin/exams", icon: "Award", section: "Administration" },
    { label: "School Reports", href: "/admin/reports", icon: "BarChart3", section: "Administration" },
    { label: "Settings", href: "/admin/settings", icon: "Settings", section: "Administration" },

    { label: "Admission Overview", href: "/admission", icon: "LayoutDashboard", section: "Admissions" },
    { label: "Register Student", href: "/admission/register", icon: "UserPlus", section: "Admissions" },
    { label: "Students", href: "/admission/students", icon: "GraduationCap", section: "Admissions" },
    { label: "Promote Students", href: "/admission/promote", icon: "ArrowUpCircle", section: "Admissions" },
    { label: "Import Excel", href: "/admission/import", icon: "FileSpreadsheet", section: "Admissions" },

    { label: "Teacher Overview", href: "/teacher", icon: "LayoutDashboard", section: "Academics & Teaching" },
    { label: "Attendance", href: "/teacher/attendance", icon: "ClipboardCheck", section: "Academics & Teaching" },
    { label: "Marks Entry", href: "/teacher/marks", icon: "PenSquare", section: "Academics & Teaching" },
    { label: "Class Broadsheet", href: "/teacher/results", icon: "Award", section: "Academics & Teaching" },
    { label: "Class Students", href: "/teacher/students", icon: "GraduationCap", section: "Academics & Teaching" },
    { label: "Teaching Timetable", href: "/teacher/timetable", icon: "CalendarDays", section: "Academics & Teaching" },

    { label: "Finance Overview", href: "/accountant", icon: "Wallet", section: "Finance & Fees" },
    { label: "Fee Structures", href: "/accountant/fee-structures", icon: "Layers", section: "Finance & Fees" },
    { label: "Invoices", href: "/accountant/invoices", icon: "FileText", section: "Finance & Fees" },
    { label: "Record Payment", href: "/accountant/payments", icon: "CreditCard", section: "Finance & Fees" },
    { label: "Balances", href: "/accountant/balances", icon: "Scale", section: "Finance & Fees" },
    { label: "Expenses", href: "/accountant/expenses", icon: "Receipt", section: "Finance & Fees" },
    { label: "Finance Reports", href: "/accountant/reports", icon: "BarChart3", section: "Finance & Fees" },
  ],
  ADMISSION: [
    { label: "Dashboard", href: "/admission", icon: "LayoutDashboard" },
    { label: "Register Student", href: "/admission/register", icon: "UserPlus" },
    { label: "Students", href: "/admission/students", icon: "GraduationCap" },
    { label: "Promote Students", href: "/admission/promote", icon: "ArrowUpCircle" },
    { label: "Import Excel", href: "/admission/import", icon: "FileSpreadsheet" },
  ],
  TEACHER: [
    { label: "Dashboard", href: "/teacher", icon: "LayoutDashboard" },
    { label: "Attendance", href: "/teacher/attendance", icon: "ClipboardCheck" },
    { label: "Marks Entry", href: "/teacher/marks", icon: "PenSquare" },
    { label: "Class Results", href: "/teacher/results", icon: "Award" },
    { label: "My Students", href: "/teacher/students", icon: "GraduationCap" },
    { label: "My Timetable", href: "/teacher/timetable", icon: "CalendarDays" },
  ],
  STUDENT: [
    { label: "Dashboard", href: "/student", icon: "LayoutDashboard" },
    { label: "My Profile", href: "/student/profile", icon: "UserCircle" },
    { label: "My Timetable", href: "/student/timetable", icon: "CalendarDays" },
    { label: "My Attendance", href: "/student/attendance", icon: "ClipboardCheck" },
    { label: "My Results", href: "/student/results", icon: "Award" },
    { label: "My Fees", href: "/student/fees", icon: "Wallet" },
  ],
  ACCOUNTANT: [
    { label: "Dashboard", href: "/accountant", icon: "LayoutDashboard" },
    { label: "Fee Structures", href: "/accountant/fee-structures", icon: "Layers" },
    { label: "Invoices", href: "/accountant/invoices", icon: "FileText" },
    { label: "Record Payment", href: "/accountant/payments", icon: "CreditCard" },
    { label: "Balances", href: "/accountant/balances", icon: "Scale" },
    { label: "Expenses", href: "/accountant/expenses", icon: "Receipt" },
    { label: "Reports", href: "/accountant/reports", icon: "BarChart3" },
  ],
};

export function canAccessPath(role: AppRole, pathname: string): boolean {
  if (role === "ADMIN") {
    return true;
  }
  if (
    pathname.startsWith("/change-password") ||
    pathname.startsWith("/print/")
  ) {
    return true;
  }
  const prefixMap: Record<string, AppRole[]> = {
    "/admin": ["ADMIN"],
    "/admission": ["ADMISSION"],
    "/teacher": ["TEACHER"],
    "/student": ["STUDENT"],
    "/accountant": ["ACCOUNTANT"],
  };
  for (const [prefix, roles] of Object.entries(prefixMap)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return roles.includes(role);
    }
  }
  return true;
}
