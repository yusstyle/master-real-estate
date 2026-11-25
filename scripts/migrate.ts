import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run the Neon database migration.');
}

const pool = new Pool({ connectionString });

try {
  for (const migrationName of ['001_initial_schema.sql', '002_renter_applications.sql', '003_application_fee.sql', '004_manual_payment.sql']) {
    const migrationPath = fileURLToPath(new URL(`../database/migrations/${migrationName}`, import.meta.url));
    const migration = await readFile(migrationPath, 'utf8');
    await pool.query(migration);
  }
  console.log('Neon database schema is ready.');
} finally {
  await pool.end();
}
