# hris-kpi-be — Panduan Folder

Backend HRIS KPI / Performa. Stack: **Hono + Drizzle ORM + Postgres + Zod + JWT (jose)**. Runtime Node via `tsx` (dev) atau `node dist` (prod).

## Root

| Path                    | Isi                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `src/`                  | Kode sumber TypeScript. Entry → [src/index.ts](src/index.ts).                                   |
| `dist/`                 | Output `tsc` (jangan edit manual).                                                              |
| `drizzle/`              | Migrasi SQL — jangan edit manual, tapi boleh tulis manual untuk DDL sederhana.                  |
| `uploads/`              | Folder file evidence yang di-upload user. Disajikan via `GET /uploads/*`.                       |
| `docker-compose.yml`    | Postgres lokal untuk dev.                                                                       |
| `drizzle.config.ts`     | Konfigurasi drizzle-kit (path schema + DB URL).                                                 |
| `package.json`          | Scripts: `dev`, `build`, `start`, `typecheck`, `db:generate`, `db:migrate`, `db:seed`, `smoke`. |
| `.env` / `.env.example` | `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `UPLOAD_DIR`.                              |

## src/

| File / Folder                          | Tanggung Jawab                                                                                                                                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [index.ts](src/index.ts)               | Bootstrap server. Panggil `serve()` di port `PORT` (default 4000).                                                                                                                                                                                               |
| [app.ts](src/app.ts)                   | **Definisi semua route Hono**. Middleware (CORS, auth), validasi Zod, handler endpoint untuk auth, appraisal, org (divisions/departments/positions/employees/job_titles/squads), cycles, kra-templates, reviews, dashboards, reports, uploads.                    |
| [repositories.ts](src/repositories.ts) | Query layer. `loadAppraisal`, `loadKras`, `loadAudit`, `replaceKras`, `templatesWithItems`, `recalculateCycleStats`. Query DB + serialisasi.                                                                                                                     |
| [serializers.ts](src/serializers.ts)   | Map row DB → bentuk JSON yang dikonsumsi FE. `initialsOf(name)` helper — initials selalu dihitung dari nama, tidak disimpan di `users`.                                                                                                                          |
| [types.ts](src/types.ts)               | Type literal: `UserRole`, `ReviewerKey`, `AppraisalStatus`, `AuditAction`, `ActorInfo`.                                                                                                                                                                          |

### src/db/

| File                          | Isi                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------- |
| [client.ts](src/db/client.ts) | Inisialisasi `postgres-js` connection pool + `drizzle()` instance.           |
| [schema.ts](src/db/schema.ts) | Definisi semua tabel. Lihat bagian **Schema** di bawah untuk detail kolom.   |

### src/domain/

| File                                    | Isi                                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [appraisal.ts](src/domain/appraisal.ts) | Mesin status appraisal. `advanceStatusFor()`, `returnTargetFor()`, `requiredRoleForApproval()`, `reviewerKeyToUserRole()`, `isAppraisalStatus()`. Forward order: `draft → sl_review → hod_review → hodiv_review → acknowledge → completed`. |

### src/http/

| File                          | Isi                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [auth.ts](src/http/auth.ts)   | JWT (jose HS256, expiry 8 jam). `AuthUser = { id, email, name, role }`. `toAuthUser(user, role)` — role diambil terpisah.   |
| [error.ts](src/http/error.ts) | `HttpError`, `fail(status, msg)`, `jsonError(c, error)`.                                                                    |

### src/scripts/

| File                                 | Fungsi                                                                |
| ------------------------------------ | --------------------------------------------------------------------- |
| [migrate.ts](src/scripts/migrate.ts) | Apply migrasi `drizzle/*.sql` ke DB. `npm run db:migrate`.            |
| [seed.ts](src/scripts/seed.ts)       | Isi data demo 13 user/employee. Password semua: `demo1234`.           |
| [smoke.ts](src/scripts/smoke.ts)     | Test sanity end-to-end. `npm run smoke`.                              |

## Schema

### `users` — auth only
`id, email, password_hash, name, created_at, updated_at`

Tidak menyimpan org data apapun. Role, dept, div, squad, position semuanya ada di `employees`.
- `created_at`: saat akun dibuat
- `updated_at`: diset saat password diubah via `POST /auth/change-password`

### `employees` — org data
`id, name, initials, email, nip, pos_id, dept_id, div_id, squad_id, job_title_id, status, joined, org_role, reviewer_sl_id, reviewer_hod_id, reviewer_hodiv_id, deleted_at`

- `org_role`: `staff | sl | hodept | hodiv | hr` — sumber role untuk JWT (dibaca saat login via email match ke `users`)
- `reviewer_sl_id / reviewer_hod_id / reviewer_hodiv_id`: self-FK ke `employees.id` (nullable)
- `initials`: disimpan di sini, dipakai saat appraisal dibuat
- `nip`: format `EMP-YEAR-XXXX`, auto-generated di FE

**Penting**: `users.id` dan `employees.id` adalah integer terpisah tapi di seed keduanya sama (1–13) karena diinsert berurutan. `appraisals.user_id` = `employees.id`. Lookup user dari appraisal: cari `users` yang `email`-nya sama dengan `employees.email`.

### `divisions`
`id, code, name, deleted_at`

### `departments`
`id, name, div_id → divisions.id, deleted_at`

Tidak ada kolom `division` text — hanya FK.

### `positions`
`id, code, title, div_id → divisions.id, dept_id → departments.id, deleted_at`

`div_id` di-backfill dari `departments.div_id` saat migrasi.

### `squads`
`id, code, name, division (text), div_id, department (text), dept_id, description, deleted_at`

Masih ada kolom text `division` dan `department` — belum di-cleanup.

### `kra_templates`
`id, code, name, dept (text), dept_id, level, version, status, updated, used_by, summary`

Masih ada kolom text `dept` — belum di-cleanup.

### `appraisals`
Menyimpan snapshot reviewer: `reviewer_sl_user_id`, `reviewer_sl_name`, `reviewer_sl_initials` (dan HoD, HoDiv versi yang sama). Snapshot ini diambil saat cycle didistribusikan, bukan live lookup.

### Soft delete
`divisions`, `departments`, `positions`, `employees`, `job_titles`, `squads` punya kolom `deleted_at`. Query harus filter `isNull(table.deletedAt)`.

## Auth Flow

1. `POST /auth/login` → cari `users` by email → verifikasi password → cari `employees` by email → ambil `orgRole` → buat JWT dengan `{ id, email, name, role }`
2. Token di-attach tiap request sebagai `Authorization: Bearer <token>`
3. `authMiddleware` verifikasi JWT → set `c.get('authUser')`
4. `GET /auth/demo-users` → list semua user dengan role dari employees (untuk login picker di FE)

## Migrasi

Urutan migrasi (0000–0018). Untuk schema change:
1. Edit `src/db/schema.ts`
2. Tulis SQL migrasi manual di `drizzle/XXXX_nama.sql` (lebih cepat dari `db:generate` untuk perubahan kecil)
3. `npm run db:migrate`

**Catatan penting**: Saat menambah kolom NOT NULL ke tabel yang sudah ada data, tambahkan nullable dulu → backfill → set NOT NULL. Lihat `0017_positions_add_div_id.sql` sebagai contoh.

## Konvensi

- **Naming response**: appraisal & audit pakai `snake_case` (kontrak FE lama). Sisa endpoint pakai `camelCase`.
- **ID**: semua serial integer.
- **Error**: `fail(status, msg)` — jangan `throw new Error` mentah.
- **Validasi input**: Zod di handler. Tapi tidak semua endpoint sudah pakai Zod — beberapa masih `as Record<string, unknown>`.
- **Auth-protected route**: `app.use('/path/*', authMiddleware)` di atas handler.
- **Initials**: selalu hitung dengan `initialsOf(name)` dari `serializers.ts`. Jangan simpan di `users`.
- **Role**: jangan hardcode di tempat selain `employees.orgRole`. Ambil dari sana.

## Alur khas request

1. `app.ts` parse + validasi.
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
