# hris-kpi-be — Panduan Folder

Backend HRIS KPI / Performa. Stack: **Hono + Drizzle ORM + Postgres + Zod + JWT (jose) + bcryptjs**. Runtime Node via `tsx` (dev) atau `node dist` (prod).

## Root

| Path                    | Isi                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `src/`                  | Kode sumber TypeScript. Entry → [src/index.ts](src/index.ts).                                   |
| `dist/`                 | Output `tsc` (jangan edit manual).                                                              |
| `drizzle/`              | Migrasi SQL — boleh tulis manual untuk DDL sederhana.                                           |
| `uploads/`              | File evidence + avatar. Disajikan via `GET /uploads/*` (authed, attachment+nosniff).            |
| `docker-compose.yml`    | Postgres lokal untuk dev.                                                                       |
| `drizzle.config.ts`     | Konfigurasi drizzle-kit.                                                                        |
| `package.json`          | Scripts: `dev`, `build`, `start`, `typecheck`, `db:generate`, `db:migrate`, `db:seed`, `smoke`. |
| `.env` / `.env.example` | Lihat **Env** di bawah.                                                                         |

## src/

| File / Folder                          | Tanggung Jawab                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [index.ts](src/index.ts)               | Bootstrap server. Panggil `serve()` di port `PORT` (default 4000).                                                  |
| [app.ts](src/app.ts)                   | Hono app builder. Middleware global (secureHeaders+CSP, CORS), `/health`, lalu register tiap route module.          |
| [config.ts](src/config.ts)             | Tunables (env→default). PASSWORD_MIN_LEN, BCRYPT_ROUNDS, JWT_EXPIRY, LOGIN\_\*, \*\_MAX\_BYTES, STUCK_REVIEW_MS, IS_PROD. |
| [log.ts](src/log.ts)                   | Structured logger. `log.{debug,info,warn,error}`. JSON lines di prod, plaintext di dev.                             |
| [repositories.ts](src/repositories.ts) | Query layer. `loadAppraisal`, `loadKras`, `loadAudit`, `replaceKras`, `templatesWithItems`, `recalculateCycleStats`.|
| [serializers.ts](src/serializers.ts)   | Map row DB → JSON FE. `initialsOf(name)` helper.                                                                    |
| [types.ts](src/types.ts)               | Type literal: `UserRole`, `ReviewerKey`, `AppraisalStatus`, `AuditAction`, `ActorInfo`.                             |

### src/db/

| File                          | Isi                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------- |
| [client.ts](src/db/client.ts) | Init `postgres-js` pool + `drizzle()` instance.                              |
| [schema.ts](src/db/schema.ts) | Definisi semua tabel. Lihat **Schema** di bawah.                             |

### src/domain/

| File                                    | Isi                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [appraisal.ts](src/domain/appraisal.ts) | Mesin status. `advanceStatusFor`, `returnTargetFor`, `requiredRoleForApproval`, `reviewerKeyToUserRole`, `isAppraisalStatus`.  |

Forward order: `draft → sl_review → hod_review → hodiv_review → acknowledge → completed`.

### src/http/

| File                          | Isi                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [auth.ts](src/http/auth.ts)   | JWT (jose HS256). Sign/verify dengan `tokenVersion` (`tv`). `authMiddleware` cek `users.tokenVersion` tiap request → revoke saat password ganti. `requireRole`, `canAccessAppraisal`, `requireAppraisalAccess`, `toAuthUser`. |
| [error.ts](src/http/error.ts) | `HttpError`, `fail(status,msg)`, `jsonError(c,err)`. 5xx di-log via `log.error` dengan stack.                                              |
| [env.ts](src/http/env.ts)     | `AppEnv = { Variables: { authUser } }`, `AppHono = Hono<AppEnv>`. Pakai di tiap route module.                                              |
| [crud.ts](src/http/crud.ts)   | Factory `crud(app, base, table, schema, {softDelete})` — generate GET/POST/PUT/DELETE dengan Zod validate + `requireRole('hr')`. `nullableId` helper Zod (number/null/'' → null). |

### src/http/routes/

Semua route module ekspor `register*Routes(app, ...)`. Dipanggil dari [app.ts](src/app.ts).

| File                                                  | Endpoints                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [auth.ts](src/http/routes/auth.ts)                    | `/auth/login`, `/auth/demo-users` (dev-only), `/auth/me`, `/auth/me/contact`, `/auth/avatar`, `/auth/change-password`, `/auth/logout`. |
| [uploads.ts](src/http/routes/uploads.ts)              | `/uploads/*` (GET authed download), `POST /uploads` (evidence file).                                   |
| [appraisals.ts](src/http/routes/appraisals.ts)        | Self-appraisal CRUD + state transitions + acknowledge.                                                 |
| [org.ts](src/http/routes/org.ts)                      | `/org/divisions \| departments \| positions \| employees \| job-titles \| squads` via `crud()`. `GET /org/employees` di-override untuk redaksi non-HR. |
| [cycles.ts](src/http/routes/cycles.ts)                | Cycle CRUD + distribute.                                                                               |
| [kra-templates.ts](src/http/routes/kra-templates.ts)  | KRA template + items.                                                                                  |
| [reports-audit.ts](src/http/routes/reports-audit.ts)  | Reports + audit trail.                                                                                 |
| [dashboard.ts](src/http/routes/dashboard.ts)          | Dashboard aggregations (employee + HR).                                                                |

### src/util/

| File                              | Fungsi                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [params.ts](src/util/params.ts)   | `numberParam(value, label?)` — parse + validate positive integer.                                                 |
| [password.ts](src/util/password.ts) | `validatePassword(value)` — min length (config) + 3 of {lower,upper,digit,symbol}.                              |
| [login-rate.ts](src/util/login-rate.ts) | In-memory sliding-window rate limit per IP+email. `checkLoginRate`, `recordLoginFailure`, `clearLoginFailures`. Single-process; ganti Redis kalau scale horizontal. |
| [upload.ts](src/util/upload.ts)   | Magic-byte sniff PDF/PNG/JPG/GIF. `AVATAR_MIME_EXT`, `UPLOAD_MIME_EXT` whitelists.                                |
| [dates.ts](src/util/dates.ts)     | `todayLabel`, `relTime` (id-ID).                                                                                  |

### src/scripts/

| File                                 | Fungsi                                                                |
| ------------------------------------ | --------------------------------------------------------------------- |
| [migrate.ts](src/scripts/migrate.ts) | Apply `drizzle/*.sql` ke DB. `npm run db:migrate`.                    |
| [seed.ts](src/scripts/seed.ts)       | Isi data demo 13 user/employee. Password semua: `demo1234`.           |
| [smoke.ts](src/scripts/smoke.ts)     | Sanity end-to-end. `npm run smoke`.                                   |

## Env

| Var                  | Default                                | Catatan                                                       |
| -------------------- | -------------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`       | —                                      | Wajib.                                                        |
| `JWT_SECRET`         | dev fallback (warn)                    | **Wajib ≥32 char di prod** (throw saat boot).                 |
| `JWT_EXPIRY`         | `8h`                                   | Format jose duration.                                         |
| `PORT`               | `4000`                                 |                                                               |
| `CORS_ORIGIN`        | `http://localhost:5173`                | Comma-separated.                                              |
| `CORS_MAX_AGE`       | `600`                                  |                                                               |
| `UPLOAD_DIR`         | `uploads`                              | Resolved relative to cwd.                                     |
| `PASSWORD_MIN_LEN`   | `10`                                   |                                                               |
| `BCRYPT_ROUNDS`      | `12`                                   |                                                               |
| `LOGIN_WINDOW_MS`    | 15 menit                               | Sliding window.                                               |
| `LOGIN_MAX_FAILS`    | `5`                                    | Per IP+email.                                               |
| `AVATAR_MAX_BYTES`   | 2 MB                                   |                                                               |
| `UPLOAD_MAX_BYTES`   | 10 MB                                  |                                                               |
| `STUCK_REVIEW_MS`    | 5 hari                                 | Dipakai dashboard "stuck" indicator.                          |
| `NODE_ENV`           | —                                      | `production` aktifkan IS_PROD: HSTS, demo-users disable, dll. |

## Schema

### `users` — auth + profile only

`id, email, password_hash, name, avatar_url, phone, emergency_name, emergency_phone, token_version, created_at, updated_at`

- Tidak menyimpan org data. Role/dept/div/squad/position semuanya di `employees`.
- `token_version`: bertambah saat password ganti → invalidate semua JWT lama.
- `updated_at`: diset saat profile/password change.
- `avatar_url`, `phone`, `emergency_*`: opsional, diisi via `/auth/me/contact` dan `/auth/avatar`.

### `employees` — org data

`id, name, initials, email, nip, pos_id, dept_id, div_id, squad_id, job_title_id, status, joined, org_role, reviewer_sl_id, reviewer_hod_id, reviewer_hodiv_id, deleted_at`

- `org_role`: `staff` / `sl` / `hodept` / `hodiv` / `hr` — sumber role JWT (lookup via email saat login).
- `reviewer_sl_id / reviewer_hod_id / reviewer_hodiv_id`: self-FK ke `employees.id` (nullable).
- `nip`: format `EMP-YEAR-XXXX`, auto-generate di FE.

`users.id` ≠ `employees.id` secara desain, tapi seed menjaga keduanya 1–13. `appraisals.user_id` = `employees.id`. Lookup user dari appraisal: cocokkan `users.email` ke `employees.email`.

### `divisions` `departments` `positions` `squads` `job_titles`

Soft-delete via `deleted_at`. Query **wajib** filter `isNull(table.deletedAt)`.

`squads` masih punya kolom text legacy `division`, `department` — belum cleanup.

### `kra_templates`

`id, name, div_id, dept_id, pos_id, version, status, updated, used_by, summary` — semua FK sudah numeric, kolom text `dept` lama sudah dihapus.

### `appraisals`

Snapshot reviewer disimpan saat distribute: `reviewer_{sl,hod,hodiv}_{user_id,name,initials}`. Bukan live lookup.

## Auth Flow

1. `POST /auth/login`: rate-check → cari `users` by email → bcrypt compare → cari `employees` by email → ambil `orgRole` → sign JWT `{user, tv}`.
2. Tiap request: `Authorization: Bearer <token>` → `authMiddleware` verify JWT (jose) + cek `users.tokenVersion === tv` → set `c.get('authUser')`.
3. `POST /auth/change-password`: validate (curr password, new ≠ curr, `validatePassword`), bump `tokenVersion`, all old tokens jadi 401 "Token revoked".
4. `POST /auth/logout`: client-side drop token; server no-op (no blacklist).
5. `GET /auth/demo-users`: dev-only login picker (404 di prod).

## Security Defaults

- `secureHeaders`: CSP minimal, frameAncestors none, X-Frame-Options DENY, no-referrer, HSTS di prod.
- Login rate limit: 5 fail per 15 menit per IP+email.
- Password policy: min 10 char, 3 of 4 classes.
- Uploads: whitelist MIME + magic-byte sniff (PDF/PNG/JPG/GIF). Text file scan control bytes. Avatar max 2 MB, evidence max 10 MB.
- Download `/uploads/*`: authed, force `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.
- `GET /org/employees`: redact field non-org (email, nip, joined, reviewer_*) untuk role non-HR.

## Migrasi

Urutan 0000–0020. Latest: `0019_users_profile_fields.sql`, `0020_users_token_version.sql`.

Workflow schema change:

1. Edit `src/db/schema.ts`.
2. Tulis SQL manual di `drizzle/XXXX_nama.sql` (lebih cepat dari `db:generate` untuk perubahan kecil).
3. `npm run db:migrate`.

Tambah NOT NULL ke tabel ber-data: nullable dulu → backfill → set NOT NULL. Contoh `0017_positions_add_div_id.sql`.

## Konvensi

- **Naming response**: appraisal & audit pakai `snake_case` (kontrak FE lama). Sisanya `camelCase`.
- **ID**: semua serial integer.
- **Error**: `fail(status, msg)` — jangan `throw new Error` mentah.
- **Validasi**: Zod di handler. CRUD via factory wajib pass Zod schema.
- **Auth**: `app.use('/path/*', authMiddleware)` di atas handler. Untuk role gate dalam handler: `requireRole(authUser, 'hr', ...)`.
- **Appraisal access**: `requireAppraisalAccess(authUser, row)` — HR bypass, pemilik & 3 reviewer ID-nya match.
- **Initials**: hitung dari `initialsOf(name)`. Jangan simpan di `users`.
- **Role**: ambil dari `employees.orgRole`. Jangan hardcode di tempat lain.
- **Logging**: pakai `log.*` (bukan `console.*`). Field structured, bukan string concat.
- **Path import**: ESM `.js` extension wajib (NodeNext).

## Alur khas request

1. Route module parse + Zod validate.
2. `requireRole` / `requireAppraisalAccess` kalau perlu.
3. Domain rules dari `domain/appraisal.ts` (status transition).
4. DB I/O via `repositories.ts` → `db/client.ts`.
5. Map ke shape FE via `serializers.ts`.
6. Error → `HttpError` → `jsonError` (auto-log 5xx).

## Run

```bash
docker compose up -d        # postgres
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev                 # http://localhost:4000
```
