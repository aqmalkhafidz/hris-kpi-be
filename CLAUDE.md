# hris-kpi-be — Panduan Folder

Backend HRIS KPI / Performa. Stack: **Hono + Drizzle ORM + Postgres + Zod + JWT (jose)**. Runtime Node via `tsx` (dev) atau `node dist` (prod).

## Root

| Path                    | Isi                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `src/`                  | Kode sumber TypeScript. Entry → [src/index.ts](src/index.ts).                                   |
| `dist/`                 | Output `tsc` (jangan edit manual).                                                              |
| `drizzle/`              | Migrasi SQL (auto-generated dari schema lewat `npm run db:generate`).                           |
| `uploads/`              | Folder file evidence yang di-upload user. Disajikan via `GET /uploads/*`.                       |
| `docker-compose.yml`    | Postgres lokal untuk dev.                                                                       |
| `drizzle.config.ts`     | Konfigurasi drizzle-kit (path schema + DB URL).                                                 |
| `package.json`          | Scripts: `dev`, `build`, `start`, `typecheck`, `db:generate`, `db:migrate`, `db:seed`, `smoke`. |
| `.env` / `.env.example` | `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `UPLOAD_DIR`.                              |

## src/

| File / Folder                          | Tanggung Jawab                                                                                                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [index.ts](src/index.ts)               | Bootstrap server. Panggil `serve()` di port `PORT` (default 4000).                                                                                                                                                                                          |
| [app.ts](src/app.ts)                   | **Definisi semua route Hono** (~833 baris). Middleware (CORS, auth), validasi Zod, handler endpoint untuk auth, appraisal, org (divisions/departments/positions/employees/job_titles/squads), cycles, kra-templates, reviews, dashboards, reports, uploads. |
| [repositories.ts](src/repositories.ts) | Query layer. `loadAppraisal`, `loadKras`, `loadAudit`, `replaceKras`, `templatesWithItems`, `recalculateCycleStats`. Query DB + serialisasi.                                                                                                                |
| [serializers.ts](src/serializers.ts)   | Map row DB → bentuk JSON yang dikonsumsi FE (snake_case untuk field appraisal/audit, camelCase untuk lainnya). `initialsOf()` helper.                                                                                                                       |
| [types.ts](src/types.ts)               | Type literal: `UserRole`, `ReviewerKey`, `AppraisalStatus`, `AuditAction`, `ActorInfo`.                                                                                                                                                                     |

### src/db/

Lapisan database (Drizzle).

| File                          | Isi                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [client.ts](src/db/client.ts) | Inisialisasi `postgres-js` connection pool + `drizzle()` instance. Export `db` & `sql`.                                                                                                                                         |
| [schema.ts](src/db/schema.ts) | Definisi tabel: `users`, `divisions`, `departments`, `positions`, `employees`, `cycles`, `kraTemplates`, `kraTemplateItems`, `appraisals`, `kras`, `evidence`, `auditEntries`, `jobTitles`, `squads`. Plus type `$inferSelect`. |

### src/domain/

Pure business rules (tanpa I/O).

| File                                    | Isi                                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [appraisal.ts](src/domain/appraisal.ts) | Mesin status appraisal. `advanceStatusFor()`, `returnTargetFor()`, `requiredRoleForApproval()`, `reviewerKeyToUserRole()`, `isAppraisalStatus()`. Forward order: `draft → sl_review → hod_review → hodiv_review → acknowledge → completed`. |

### src/http/

Helper HTTP cross-cutting.

| File                          | Isi                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [auth.ts](src/http/auth.ts)   | JWT (jose HS256, expiry 8 jam). Export `signToken`, `verifyToken`, `authMiddleware`, `toAuthUser`, type `AuthUser`.    |
| [error.ts](src/http/error.ts) | `HttpError` class, helper `fail(status, msg)` (throw), `jsonError(c, error)` (renderer). Dipasang via `app.onError()`. |

### src/scripts/

CLI utilities (jalan via `tsx`).

| File                                 | Fungsi                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| [migrate.ts](src/scripts/migrate.ts) | Apply migrasi `drizzle/*.sql` ke DB. Dipanggil `npm run db:migrate`.                          |
| [seed.ts](src/scripts/seed.ts)       | Isi data demo (users, divisions, dept, employees, cycles, templates, dst). `npm run db:seed`. |
| [smoke.ts](src/scripts/smoke.ts)     | Test sanity end-to-end terhadap server berjalan. `npm run smoke`.                             |

## drizzle/

Migrasi SQL berurutan:

- `0000_initial.sql` — skema awal (users, appraisals, kras, evidence, audit_entries, dst).
- `0001_numeric_sequence_ids.sql` — konversi ID ke serial integer.
- `0002_calibration.sql` — tambah `calibrated_score`, `final_grade`, `calibrated_at` di `appraisals`.
- `0003_job_titles.sql` — tabel `job_titles`.
- `0004_squads.sql` — tabel `squads`.

Generate migrasi baru → edit `src/db/schema.ts` lalu `npm run db:generate`.

## Konvensi

- **Naming response**: appraisal & audit pakai `snake_case` (kontrak FE lama). Sisa endpoint pakai `camelCase`.
- **ID**: semua serial integer.
- **Status code error**: lewat `fail(status, msg)` — jangan `throw new Error` mentah.
- **Validasi input**: selalu Zod di handler `app.post/...`.
- **Auth-protected route**: pasang `authMiddleware`, ambil user dengan `c.get('authUser')`.
- **File uploads**: tulis ke `uploads/`, kembalikan URL `/uploads/<filename>`.

## Alur khas request

1. `app.ts` parse + validasi (Zod).
2. Domain rules dari `domain/appraisal.ts` (kalau status transition).
3. DB I/O via `repositories.ts` → `db/client.ts`.
4. Map ke shape FE via `serializers.ts`.
5. Error → `HttpError` → `jsonError`.

## Run

```bash
docker compose up -d        # postgres
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev                 # http://localhost:4000
```
