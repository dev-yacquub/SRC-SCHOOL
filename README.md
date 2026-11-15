# School Management System

Simple, role-based web application for a single school with **5 roles only**:
**Admin**, **Admission Officer**, **Teacher**, **Student**, and **Accountant** (no library or hostel modules).

## Tech Stack
- **Framework:** Next.js 16 (App Router, TypeScript, Tailwind CSS)
- **Database & Analytics:** Firebase (`src-tech-school` Cloud Firestore + Firebase Analytics; optional SQLite fallback via `DATABASE_PROVIDER="sqlite"`)
- **Auth:** Cookie-based JWT (`jose`) with bcrypt password hashing, server-side RBAC, and configurable idle timeout
- **Excel Import/Export:** ExcelJS
- **Printable PDFs:** Print-optimized Receipt, Report Card, Admission Form, and Student ID Card views

## Quick Start (Firebase Cloud Firestore)

1. In [Firebase Console](https://console.firebase.google.com/) for project `src-tech-school`, ensure **Build -> Firestore Database** is created.
2. **Production & Local Security:** Generate a Service Account key (**Project Settings -> Service Accounts -> Generate New Private Key**) and add either `FIREBASE_SERVICE_ACCOUNT_KEY` or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` to `.env`, keeping `firestore.rules` locked down (`allow read, write: if false;` for direct client access). Never enable public `allow read, write: if true;` rules in production.
3. Populate Cloud Firestore:

```bash
npm install
npm run db:seed          # Seed fresh starter school data into Firestore
# OR migrate existing records from prisma/dev.db:
npm run db:migrate:firebase
npm run dev
```

Check connection status anytime at `GET /api/health`, then open `http://localhost:3000/login`.

## Seeded Demo Accounts (Password: `Password123!`)

| Role | Username | Landing Portal |
|---|---|---|
| Admin | `admin` | `/admin` |
| Admission Officer | `admission` | `/admission` |
| Teacher | `teacher` | `/teacher` |
| Accountant | `accountant` | `/accountant` |
| Student | `student` | `/student` |

## Scripts
- `npm run dev` — Start development server
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm test` — Run Vitest unit tests
- `npm run db:seed` — Seed initial school settings, classes, subjects, users, and sample records into the active database
- `npm run db:migrate:firebase` — Migrate all existing records from `prisma/dev.db` into Cloud Firestore
- `npm run db:push` — Push Prisma schema (SQLite mode)
