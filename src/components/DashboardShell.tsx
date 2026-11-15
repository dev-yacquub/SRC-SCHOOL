"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarDays,
  Award,
  BarChart3,
  Settings,
  UserPlus,
  GraduationCap,
  ArrowUpCircle,
  FileSpreadsheet,
  ClipboardCheck,
  PenSquare,
  UserCircle,
  Wallet,
  Layers,
  FileText,
  CreditCard,
  Scale,
  Receipt,
  LogOut,
  KeyRound,
  Menu,
  X,
  School,
} from "lucide-react";
import { AppRole, ROLE_LABELS, ROLE_NAV } from "@/lib/role-routes";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarDays,
  Award,
  BarChart3,
  Settings,
  UserPlus,
  GraduationCap,
  ArrowUpCircle,
  FileSpreadsheet,
  ClipboardCheck,
  PenSquare,
  UserCircle,
  Wallet,
  Layers,
  FileText,
  CreditCard,
  Scale,
  Receipt,
};

export function DashboardShell({
  user,
  schoolName,
  academicLabel,
  children,
}: {
  user: { fullName: string; username: string; role: AppRole };
  schoolName: string;
  academicLabel?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const navItems = ROLE_NAV[user.role] ?? [];

  useEffect(() => {
    const IDLE_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        router.push("/login");
        router.refresh();
      }, IDLE_MS);
    };
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <School className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{schoolName}</p>
          <p className="truncate text-xs text-slate-400">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
      </div>

      {academicLabel && (
        <div className="mx-4 mt-4 rounded-lg bg-slate-800/80 px-3 py-2 text-xs text-slate-300">
          {academicLabel}
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item, idx) => {
          const prevSection = idx > 0 ? navItems[idx - 1].section : undefined;
          const showSection = item.section && item.section !== prevSection;
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const isRoot =
            item.href === "/admin" ||
            item.href === "/admission" ||
            item.href === "/teacher" ||
            item.href === "/student" ||
            item.href === "/accountant";
          const active = isRoot
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <React.Fragment key={item.href}>
              {showSection && (
                <p className="px-3 pt-4 pb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase first:pt-1">
                  {item.section}
                </p>
              )}
              <Link
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-4">
        <div className="mb-3 px-1">
          <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
          <p className="truncate text-xs text-slate-400">@{user.username}</p>
        </div>
        <div className="space-y-1">
          <Link
            href="/change-password"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Change Password
          </Link>
          <button
            type="button"
            disabled={loggingOut}
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-300 hover:bg-slate-800 hover:text-rose-200 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            {loggingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="no-print hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 w-64 max-w-[80vw]">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-semibold text-slate-900">
            {schoolName}
          </span>
          <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
            {user.role}
          </span>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

