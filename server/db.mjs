import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const seedPath = path.join(__dirname, 'seed-jobs.json');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Configure PostgreSQL before starting RRGBS.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('candidate', 'employer')),
  company_name TEXT NOT NULL DEFAULT '',
  gst_number TEXT NOT NULL DEFAULT '',
  registration_id TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  company_logo_text TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT NOT NULL,
  experience TEXT NOT NULL,
  salary TEXT NOT NULL DEFAULT 'Best in Industry',
  description TEXT NOT NULL,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsibilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  posted_date TEXT NOT NULL DEFAULT 'Just now',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  applicant_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  experience TEXT NOT NULL DEFAULT '',
  current_location TEXT NOT NULL DEFAULT '',
  resume_file_name TEXT NOT NULL DEFAULT '',
  resume_storage JSONB,
  notes TEXT NOT NULL DEFAULT '',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  target_category TEXT NOT NULL DEFAULT '',
  preferred_city TEXT NOT NULL DEFAULT '',
  file_storage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_jobs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  inquiry_type TEXT NOT NULL DEFAULT 'General Staffing Inquiry',
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS home_enquiries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL,
  location TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  customer_location TEXT NOT NULL DEFAULT '',
  customer_message TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bulk_quotes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_job_email_unique
ON applications (job_id, LOWER(email));
CREATE INDEX IF NOT EXISTS idx_resumes_email ON resumes(email);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users (phone);
`;

function id(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function mapJob(row) {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    companyLogoText: row.company_logo_text,
    location: row.location,
    category: row.category,
    type: row.type,
    experience: row.experience,
    salary: row.salary,
    description: row.description,
    skills: row.skills || [],
    responsibilities: row.responsibilities || [],
    requirements: row.requirements || [],
    benefits: row.benefits || [],
    postedDate: row.posted_date,
    isFeatured: row.is_featured,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
  };
}

export async function initDatabase() {
  await query(schemaSql);
  const count = await query('SELECT COUNT(*)::int AS count FROM jobs');
  if (count.rows[0].count > 0) return;

  const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'));
  await withTransaction(async (client) => {
    for (const job of seed) {
      await client.query(
        `INSERT INTO jobs
          (id,title,company,company_logo_text,location,category,type,experience,salary,description,skills,responsibilities,requirements,benefits,posted_date,is_featured)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16)
         ON CONFLICT (id) DO NOTHING`,
        [
          job.id, job.title, job.company, job.companyLogoText || '', job.location, job.category, job.type,
          job.experience, job.salary || 'Best in Industry', job.description,
          JSON.stringify(job.skills || []), JSON.stringify(job.responsibilities || []),
          JSON.stringify(job.requirements || []), JSON.stringify(job.benefits || []),
          job.postedDate || 'Just now', Boolean(job.isFeatured),
        ],
      );
    }
  });
}

export async function closeDatabase() {
  await pool.end();
}

export { mapJob, id };
