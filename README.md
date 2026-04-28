# Performa HRIS KPI Backend

Hono + Drizzle + Postgres backend for the Performa appraisal MVP.

## Setup

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Default API URL: `http://localhost:4000`.

Demo users use password `demo1234`.

## Useful Scripts

- `npm run dev` starts Hono in watch mode.
- `npm run typecheck` validates TypeScript.
- `npm run build` compiles to `dist`.
- `npm run db:migrate` applies Drizzle migrations.
- `npm run db:seed` resets and seeds demo data.
- `npm run smoke` runs API smoke checks against a running server.
