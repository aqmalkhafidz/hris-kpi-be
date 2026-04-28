import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from '../db/client.js';

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS __migrations (
      name text PRIMARY KEY,
      applied_at timestamp NOT NULL DEFAULT now()
    )
  `;
  const dir = path.resolve(process.cwd(), 'drizzle');
  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const [existing] =
      await sql`SELECT name FROM __migrations WHERE name = ${file}`;
    if (existing) continue;
    const migration = await readFile(path.join(dir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await tx`INSERT INTO __migrations (name) VALUES (${file})`;
    });
    console.log(`Applied ${file}`);
  }
  console.log('Migrations complete');
}

await main();
await sql.end();
