import 'dotenv/config';
import { query } from '../server/db.mjs';

const tables = ['users','jobs','applications','resumes','saved_jobs','contact_inquiries','home_enquiries','store_orders','bulk_quotes','password_resets'];
try {
  console.log('\nRRGBS PostgreSQL data summary\n');
  for (const table of tables) {
    const result = await query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    console.log(`${table}: ${result.rows[0].count}`);
  }
} finally {
  process.exit(0);
}
