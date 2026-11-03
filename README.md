# Education ERP

Multi-tenant ERP for schools, coaching centres and colleges (see `Education_ERP_BRD.pdf`).
The API covers the BRD's MVP scope (section 4.1); `apps/web` holds the office portal and the
teacher and parent apps.

## Stack

| Part | Choice |
|---|---|
| Language | TypeScript 6 (ES modules) everywhere |
| API | NestJS 12, modular monolith (`apps/api`) |
| Database | PostgreSQL 15+ with row-level security, Drizzle ORM (`packages/db`) |
| Shared code | Permission catalogue, vertical packs, zod request schemas (`packages/shared`) |
| Tests | Vitest + Supertest against a real `erp_test` database |
| Jobs | Queue tables in Postgres claimed with `SKIP LOCKED` (no Redis); worker runs in the API process |
| Messaging | WhatsApp Cloud API (`WHATSAPP_PROVIDER=meta`) or console; SMS fallback; signed status webhooks |
| Files | Local disk in development (`FILE_STORAGE_DIR`), behind a `FileStorage` interface for S3 |

## First-time setup (Windows, no Docker)

Requires Node 24+ and PostgreSQL 15+ (its `bin` folder on `PATH`). pnpm runs through
`corepack`, which ships with Node, so nothing is installed globally.

```powershell
corepack pnpm install
copy .env.example .env        # then set JWT_SECRET to a long random string
corepack pnpm pg:start        # project-only Postgres on localhost:5433 (data in %LOCALAPPDATA%\erp-dev)
corepack pnpm db:setup        # creates database + roles, runs migrations, syncs permissions/plans
corepack pnpm db:seed         # optional: demo school with one user per role
corepack pnpm dev             # API on http://localhost:3000, rebuilds on save
corepack pnpm dev:web         # web apps on http://localhost:3001 (second terminal)
corepack pnpm test            # recreates erp_test and runs the e2e suite
```

**Using your installed PostgreSQL service instead.** If you'd rather not run a second server,
point `.env` at the PostgreSQL Windows service: set `ADMIN_DATABASE_URL` to
`postgres://postgres:<your password>@localhost:5432/postgres` and change the port in the other
two URLs to 5432, then run `db:setup`. A Windows service starts with the machine and is the most
reliable option for daily work.

Signing in with the demo data: `POST /auth/otp/request {"phone":"+919000000002"}`; the code is
printed in the API log (`SMS_PROVIDER=console`). Then `POST /auth/otp/verify`, and send
`Authorization: Bearer <accessToken>` plus `X-Institute-Id: <id from GET /me>` on institute routes.

## Web apps (`apps/web`)

One Next.js app with three experiences, chosen after sign-in from the person's roles:

| Path | For | Highlights |
|---|---|---|
| `/admin` | Office, principal, management | Live dashboard, students (admission, Excel import, profiles), staff, classes and assignments, attendance register, calendar with approvals, circulars with read/agree tracking, message log and automations, report downloads, settings |
| `/teacher` | Teachers (mobile-first) | Today view, one-tap attendance that works offline and syncs later, posting homework with photo or voice note, reviewing completion, notices |
| `/parent` | Parents (mobile-first) | All children under one login, attendance calendar, homework with teacher feedback, notices with "I agree", study material, school calendar |

The browser calls `/api/*` on the web origin and Next forwards to the API (`API_URL`, default
`http://localhost:3000`), so no CORS setup is needed. In development the API returns the sign-in
code (`devCode`) because no SMS is sent; the sign-in page fills it in. The teacher and parent apps
are installable web apps (manifest included) and can later be wrapped for the Play Store.

Visual checks: `node scripts/screenshots.mjs <phone> <admin|teacher|parent> <routes>` in `apps/web`
captures desktop and phone screenshots; `scripts/demo-activity.mjs` adds a week of demo activity and
`scripts/demo-exams.mjs` a published unit test plus a mid-term in marks entry.

## Commands

| Command | Does |
|---|---|
| `pg:start` / `pg:stop` / `pg:status` | Manage the project-only Postgres server |
| `db:setup` | Idempotent: database, roles, migrations, catalogues. Safe on every deploy |
| `db:generate` | Generate a migration after editing `packages/db/src/schema` |
| `db:seed` | Demo school: admin, principal, class teacher, three students and two parents |
| `build`, `typecheck`, `test`, `dev` | As named |

## How tenancy and access work

- **Two database roles.** `erp_app` has row-level security enforced and serves every
  institute-scoped request. `erp_system` bypasses RLS and is used only for sign-in, tenant
  provisioning and global identity lookups (`SYSTEM_DB` in the API).
- **Tenant context per transaction.** `TenantDb.run()` opens a transaction and sets
  `app.institute_id` / `app.user_id`; every policy compares against those. With nothing set, no
  rows are visible.
- **Request flow.** The global `AuthGuard` verifies the JWT and that the session is still live,
  checks membership of the institute named in `X-Institute-Id`, loads that institute's
  permissions and enforces `@RequirePermissions(...)`.
- **One identity, many roles (USR-01).** `users` is global; `user_roles` links a person to roles
  per institute. A parent at one school can teach at another with the same phone number.
- **Audit.** `AuditService.record(tx, ...)` writes in the same transaction as the change. The
  audit table is append-only for both database roles.

### Checklist for every new tenant table

1. `institute_id uuid not null` referencing `institutes`.
2. References to other tenant tables use a composite key `(id, institute_id)`, because
   foreign-key checks bypass RLS (see `user_roles_role_fk`).
3. In a custom migration: `ENABLE ROW LEVEL SECURITY`, a `tenant_isolation` policy, and
   explicit grants to `erp_app` (column-level `UPDATE` grants for sensitive columns).
4. A test in `tenancy.e2e.test.ts` fails if any table with `institute_id` lacks RLS or a policy.

### Parents and students ("own" access)

Parent and student roles carry no institute-wide permissions. Everything they see comes from
`/family/...` and `/inbox` routes, which resolve the caller's own guardian link
(`FamilyService.child`) and answer 404 for anyone else's child.

### Notifications

Services call `NotificationsService.emit(tx, type, payload)` inside their transaction (an
outbox). The worker (`NotificationEngine.runOnce`) applies the institute's automation rules,
resolves recipients inside that institute's RLS context, picks WhatsApp (opted-in guardians)
or SMS, schedules digests at the institute's local digest time, retries with backoff, falls back
to SMS, and enforces the plan's monthly WhatsApp quota. Meta templates must be approved under
the names in `packages/shared/src/notifications.ts`.

## What's built: BRD MVP (section 4.1)

| Step | BRD | Main routes |
|---|---|---|
| 1 Foundation | PLT-01..04, CFG-01/02/05, USR-01..08, CAL-01 | `/auth/*`, `/me`, `/platform/*`, `/institute`, `/roles`, `/users`, `/academic-years`, `/audit-logs` |
| 2 Staff, academic structure | STF-01/02/04, ACA-01/02 | `/staff`, `/classes`, `/subjects`, `/sections`, `/me/teaching` |
| 3 Students, guardians | STU-02..05, CFG-07, USR-04/05 | `/students`, `/students/import`, `/family/children` |
| 4 Holidays, events | CAL-02..06 | `/calendar/events`, `/calendar/events/day-status`, `/family/calendar` |
| 5 Attendance | ATT-01..05, 07, 08, BR-01..04 | `/attendance/sections/:id`, `/attendance/reports/*`, `/family/children/:id/attendance` |
| 6 Notification engine | COM-02, 04, 08, PLT-04, ATT-04, BR-11/12 | `/messages`, `/automation-rules`, `/webhooks/whatsapp`, `/platform/usage` |
| 7 Homework, files | HW-01..03, 05, BR-10, §16 signed links | `/homework`, `/files`, `/family/children/:id/homework` |
| 8 Learning materials | MAT-01, 02, 04 | `/materials`, `/family/children/:id/materials` |
| 9 Circulars | COM-01, 03 | `/circulars`, `/inbox` |
| 10 Dashboards, reports | RPT-01, 02, ATT-08 | `/dashboards/*`, `/reports/*?format=csv\|xlsx`, `/family/children/:id/summary` |

### Not built yet

- Native app-store packaging of the teacher and parent apps (they run as installable web apps today).
- Push notifications (needs the mobile app); student logins (USR-06); period-wise attendance
  (needs the timetable, ACA-03/04); payment gateway and fees (M16, Version 1).
- Production adapters: S3 for files, a DLT-registered SMS provider (only the console sender exists).
- Version 1 modules still to come: staff attendance and leave, curriculum tracking, timetable, AI.
- Report cards as PDF (they are web pages shared by link today).
