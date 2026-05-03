import 'dotenv/config';
import { db, sql } from '../db/client.js';
import { employees, users } from '../db/schema.js';

async function main() {
  console.log('--- EMPLOYEES ---');
  const empList = await db.select().from(employees);
  empList.forEach((e) => {
    console.log(
      `ID: ${e.id}, Name: ${e.name}, Email: "${e.email}", HoDivID: ${e.reviewerHodivId}`
    );
  });

  console.log('\n--- USERS ---');
  const userList = await db.select().from(users);
  userList.forEach((u) => {
    console.log(`ID: ${u.id}, Name: ${u.name}, Email: "${u.email}"`);
  });

  await sql.end();
}

main().catch(console.error);
