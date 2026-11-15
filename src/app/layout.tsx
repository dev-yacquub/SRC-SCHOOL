import type { Metadata } from "next";
import { FirebaseAnalytics } from "@/components/FirebaseAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.SCHOOL_NAME || "SRC Tech School",
  description:
    "Simple, role-based school management system for Admin, Admission, Teacher, Student, and Accountant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <FirebaseAnalytics />
        {children}
      </body>
    </html>
  );
}

