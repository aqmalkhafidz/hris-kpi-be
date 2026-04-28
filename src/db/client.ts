import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/hris_kpi';

export const sql = postgres(databaseUrl, { max: 10 });
export const db = drizzle(sql, { schema });
