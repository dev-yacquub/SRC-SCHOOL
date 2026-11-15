"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  PenSquare,
  Users,
} from "lucide-react";

const TABS = [
  { href: "/teacher/attendance", label: "Attend", icon: ClipboardCheck, exact: false },
  { href: "/teacher", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/teacher/marks", label: "Marks", icon: PenSquare, exact: false },
  { href: "/teacher/results", label: "Results", icon: Award, exact: false },
  { href: "/teacher/students", label: "Students", icon: Users, exact: false },
  { href: "/teacher/timetable", label: "Schedule", icon: CalendarDays, exact: false },
];

export function TeacherMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Teacher mobile navigation"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(15,23,42,0.06)] backdrop-blur-sm lg:hidden"
    >
      <div className="grid grid-cols-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.exact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors ${
                active
                  ? "text-indigo-600"
                  : "text-slate-500 active:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "stroke-[2.25]" : ""}`} />
              <span className="truncate leading-tight">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

