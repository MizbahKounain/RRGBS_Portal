import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Resend } from 'resend';
import { v2 as cloudinary } from 'cloudinary';
import ExcelJS from 'exceljs';
import { query, withTransaction, initDatabase, mapJob, id } from './db.mjs';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || 'rrgbs-local-development-secret-change-me';
const isProduction = process.env.NODE_ENV === 'production';
const RESET_TTL_MINUTES = Math.max(5, Math.min(60, Number(process.env.PASSWORD_RESET_TTL_MINUTES || 15)));
const RESET_MAX_ATTEMPTS = 5;
const app = express();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const emailFrom = String(process.env.EMAIL_FROM || '').trim();
const emailTo = String(process.env.EMAIL_TO || 'info@rrgroupofbusinesssolutions.in').trim();

if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL, secure: true });
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many authentication attempts. Please try again later.' } });
const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many password reset requests. Please try again later.' } });
app.use('/api', apiLimiter);

function idempotentId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}
function cleanEmail(v) { return String(v || '').trim().toLowerCase(); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  try {
    const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(actual, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
function base64url(input) { return Buffer.from(input).toString('base64url'); }
function signToken(payload) {
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const user = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : '');
  if (!user) return res.status(401).json({ message: 'Please sign in to continue.' });
  req.user = user;
  next();
}
function publicUser(user) {
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone || '', role: user.role,
    companyName: user.company_name || user.companyName || '', gstNumber: user.gst_number || user.gstNumber || '',
    registrationId: user.registration_id || user.registrationId || ''
  };
}
function validateRequired(obj, fields) { return fields.find((f) => !String(obj?.[f] ?? '').trim()); }
function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function getOrigin(req) {
  const configured = String(process.env.APP_ORIGIN || '').trim().replace(/\/$/, '');
  return configured || `${req.protocol}://${req.get('host')}`;
}

function buildEmail({ title, intro, rows = [], footer = 'RRGBS - Reliable People, Professional Services' }) {
  const text = [title, '', intro, '', ...rows.map(([k, v]) => `${k}: ${String(v ?? '')}`), '', footer].join('\n');
  const htmlRows = rows.map(([label, value]) => `<tr><td style="padding:11px 13px;border:1px solid #e5e7eb;background:#f8fafc;font-weight:700;color:#374151;width:34%;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:11px 13px;border:1px solid #e5e7eb;color:#111827;vertical-align:top;white-space:pre-wrap;">${escapeHtml(value)}</td></tr>`).join('');
  const html = `<div style="margin:0;background:#f5f6f8;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#111827;"><div style="max-width:700px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;"><div style="background:#111;padding:22px 26px;"><div style="font-size:24px;font-weight:800;color:#fff;">RR<span style="color:#d71920;">GBS</span></div><div style="margin-top:5px;font-size:12px;letter-spacing:1px;color:#d1d5db;">RELIABLE PEOPLE, PROFESSIONAL SERVICES</div></div><div style="padding:26px;"><h2 style="margin:0 0 8px;color:#111827;">${escapeHtml(title)}</h2><p style="margin:0 0 20px;color:#6b7280;font-size:14px;">${escapeHtml(intro)}</p>${rows.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px;">${htmlRows}</table>` : ''}</div><div style="padding:16px 26px;background:#f8fafc;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">${escapeHtml(footer)}</div></div></div>`;
  return { text, html };
}

async function sendEmail({ to, subject, text, html, replyTo, idempotencyKey }) {
  if (!resend || !emailFrom) return { sent: false, reason: 'Email service is not configured. Add RESEND_API_KEY and EMAIL_FROM.' };
  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
    ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
  });
  if (error) throw new Error(error.message || 'Email provider rejected the message.');
  return { sent: true, id: data?.id };
}

function buildContactEmail(body) {
  return buildEmail({
    title: 'New RRGBS Business Enquiry',
    intro: 'A new enquiry was submitted through the RRGBS website.',
    rows: [
      ['Name', body.name], ['Company / Organization', body.company || 'Not provided'], ['Phone / WhatsApp', body.phone],
      ['Email', body.email], ['Service Required', body.inquiryType || 'General Staffing Inquiry'],
      ['Requirement Details', body.message || 'Not provided'],
      ['Received', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })],
    ],
  });
}
function buildHomeEmail(body) {
  return buildEmail({
    title: 'New Home Service Enquiry',
    intro: `A customer requested ${body.service}.`,
    rows: [['Name', body.name], ['Mobile', body.phone], ['Email', body.email || 'Not provided'], ['Service', body.service], ['Location', body.location], ['Requirement', body.message || 'Please coordinate earliest.']],
  });
}
function buildResetEmail(code) {
  return buildEmail({
    title: 'RRGBS Password Reset Code',
    intro: `Use the verification code below to reset your RRGBS account password. The code expires in ${RESET_TTL_MINUTES} minutes.`,
    rows: [['Verification code', code], ['Expires in', `${RESET_TTL_MINUTES} minutes`]],
    footer: 'If you did not request a password reset, you can safely ignore this email.',
  });
}

function hashResetCode(code) {
  return crypto.createHash('sha256').update(`${String(code)}:${JWT_SECRET}`).digest('hex');
}
function generateResetCode() { return String(crypto.randomInt(100000, 1000000)); }

function cloudinaryReady() {
  return Boolean(process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET));
}
async function uploadResumeToCloudinary(fileName, dataUrl, prefix) {
  if (!dataUrl) return null;
  if (!cloudinaryReady()) throw new Error('Resume storage is not configured. Add Cloudinary credentials before accepting resumes.');
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('Invalid resume file data.');
  const [, mime, b64] = match;
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length) throw new Error('Resume file is empty.');
  if (buffer.length > 5 * 1024 * 1024) throw new Error('File must be 5MB or smaller.');
  const original = String(fileName || 'resume.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = path.extname(original).toLowerCase() || (mime.includes('pdf') ? '.pdf' : '.bin');
  const publicId = `${prefix}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const result = await cloudinary.uploader.upload(`data:${mime};base64,${b64}`, {
    resource_type: 'raw',
    type: 'private',
    asset_folder: 'rrgbs/resumes',
    public_id: publicId,
    overwrite: false,
  });
  return { provider: 'cloudinary', publicId: result.public_id, resourceType: 'raw', deliveryType: 'private', originalName: String(fileName || 'resume'), mime, size: buffer.length, format: ext.replace(/^\./, '') };
}

app.use((req, res, next) => {
  const configured = String(process.env.APP_ORIGIN || '').trim().replace(/\/$/, '');
  const origin = req.headers.origin;
  if (configured && origin && origin === configured) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
  } else if (!configured && origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, service: 'RRGBS API', database: 'connected', emailConfigured: Boolean(resend && emailFrom), resumeStorageConfigured: cloudinaryReady() });
  } catch (error) {
    res.status(503).json({ ok: false, service: 'RRGBS API', database: 'unavailable', message: error.message });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { name, email, phone, password, role = 'candidate', companyName = '' } = req.body || {};
  if (validateRequired(req.body, ['email', 'password', 'phone'])) {
  return res.status(400).json({
    message: 'Email, password and mobile number are required.'
  });
}

if (String(password).length < 8) {
  return res.status(400).json({
    message: 'Password must be at least 8 characters.'
  });
}

const normalizedPhone = String(phone || '').replace(/\D/g, '');

if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
  return res.status(400).json({
    message: 'Please enter a valid 10-digit Indian mobile number.'
  });
}
  if (!['candidate', 'employer'].includes(role)) return res.status(400).json({ message: 'Invalid account role.' });
  if (role === 'candidate' && !String(name || '').trim()) return res.status(400).json({ message: 'Full name is required.' });
  if (role === 'employer' && !String(companyName || name || '').trim()) return res.status(400).json({ message: 'Company name is required.' });

  const normalized = cleanEmail(email);
  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalized]);
    if (existing.rowCount) return res.status(409).json({ message: 'An account with this email already exists.' });
    const user = {
      id: idempotentId('usr'), name: String(role === 'employer' ? (companyName || name) : name).trim(), email: normalized,
      phone: normalizedPhone, role, companyName: String(companyName || '').trim(), passwordHash: hashPassword(password),
    };
    await query(`INSERT INTO users (id,name,email,phone,role,company_name,password_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [user.id,user.name,user.email,user.phone,user.role,user.companyName,user.passwordHash]);
    const token = signToken({ sub: user.id, role: user.role, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
    res.status(201).json({ token, user: publicUser({ ...user, company_name: user.companyName }) });
  } catch (error) {
    if (error.code === '23505') {
  if (error.constraint === 'users_email_key') {
    return res.status(409).json({
      message: 'An account with this email already exists.'
    });
  }

  if (error.constraint === 'idx_users_phone_unique') {
    return res.status(409).json({
      message: 'An account with this mobile number already exists.'
    });
  }

  return res.status(409).json({
    message: 'An account with these details already exists.'
  });
}
    console.error(error); res.status(500).json({ message: 'Could not create your account.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { phone, password, role } = req.body || {};

  if (validateRequired(req.body, ['phone', 'password'])) {
    return res.status(400).json({
      message: 'Mobile number and password are required.'
    });
  }

  const normalizedPhone = String(phone || '').replace(/\D/g, '');

  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    return res.status(400).json({
      message: 'Please enter a valid 10-digit Indian mobile number.'
    });
  }

  try {
    const result = await query(
      'SELECT * FROM users WHERE phone = $1',
      [normalizedPhone]
    );

    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({
        message: 'Invalid mobile number or password.'
      });
    }

    if (role && user.role !== role) {
      return res.status(403).json({
        message: `This account is registered as ${user.role === 'employer' ? 'Employer / Recruiter' : 'Job Seeker'}.`
      });
    }

    const token = signToken({
      sub: user.id,
      role: user.role,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7
    });

    res.json({
      token,
      user: publicUser(user)
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: 'Could not sign you in.'
    });
  }
});

app.post('/api/auth/forgot-password', resetLimiter, async (req, res) => {
  const email = cleanEmail(req.body?.email);
  if (!email) return res.status(400).json({ message: 'Email address is required.' });
  const generic = { message: 'If an account exists for that email, a password reset code has been sent.' };
  try {
    const result = await query('SELECT id,email,name FROM users WHERE email = $1', [email]);
    if (!result.rowCount) return res.json(generic);
    const user = result.rows[0];
    await query('DELETE FROM password_resets WHERE user_id = $1 OR expires_at < NOW()', [user.id]);
    const code = generateResetCode();
    await query(`INSERT INTO password_resets (id,user_id,code_hash,expires_at) VALUES ($1,$2,$3,NOW() + ($4 * INTERVAL '1 minute'))`, [idempotentId('reset'), user.id, hashResetCode(code), RESET_TTL_MINUTES]);
    const emailData = buildResetEmail(code);
    const resultEmail = await sendEmail({ to: user.email, subject: 'RRGBS password reset code', text: emailData.text, html: emailData.html, idempotencyKey: `password-reset-${user.id}-${Date.now()}` });
    if (!resultEmail.sent) return res.status(503).json({ message: resultEmail.reason });
    return res.json(generic);
  } catch (error) { console.error('Forgot password error:', error); res.status(500).json({ message: 'Could not start password reset.' }); }
});

app.post('/api/auth/reset-password', resetLimiter, async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const code = String(req.body?.code || '').trim();
  const password = String(req.body?.password || '');
  if (!email || !/^\d{6}$/.test(code) || password.length < 8) return res.status(400).json({ message: 'Enter a valid 6-digit code and a password of at least 8 characters.' });
  try {
    const result = await query(`SELECT pr.*, u.email FROM password_resets pr JOIN users u ON u.id = pr.user_id WHERE u.email = $1 AND pr.used_at IS NULL ORDER BY pr.created_at DESC LIMIT 1`, [email]);
    const reset = result.rows[0];
    if (!reset) return res.status(400).json({ message: 'This reset code is invalid or has expired.' });
    if (reset.attempts >= RESET_MAX_ATTEMPTS) return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new code.' });
    if (new Date(reset.expires_at).getTime() < Date.now()) return res.status(400).json({ message: 'This reset code has expired. Please request a new one.' });
    const supplied = hashResetCode(code);
    const valid = crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(reset.code_hash));
    if (!valid) {
      await query('UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1', [reset.id]);
      return res.status(400).json({ message: 'Incorrect reset code.' });
    }
    await withTransaction(async (client) => {
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(password), reset.user_id]);
      await client.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [reset.id]);
      await client.query('DELETE FROM password_resets WHERE user_id = $1 AND id <> $2', [reset.user_id, reset.id]);
    });
    res.json({ message: 'Password updated successfully. You can now sign in.' });
  } catch (error) { console.error(error); res.status(500).json({ message: 'Could not reset your password.' }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const result = await query('SELECT * FROM users WHERE id = $1', [req.user.sub]);
  if (!result.rowCount) return res.status(401).json({ message: 'Account no longer exists.' });
  res.json({ user: publicUser(result.rows[0]) });
});

app.get('/api/jobs', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const location = String(req.query.location || '').toLowerCase().trim();
  const category = String(req.query.category || '').toLowerCase().trim();
  const type = String(req.query.type || '').toLowerCase().trim();
  const result = await query(`SELECT * FROM jobs ORDER BY created_at DESC`);
  const jobs = result.rows.map(mapJob).filter(j =>
    (!q || [j.title,j.company,j.category,...(j.skills||[])].join(' ').toLowerCase().includes(q)) &&
    (!location || j.location.toLowerCase().includes(location)) &&
    (!category || (category === 'non it' ? recruiterCategoryMatch(j, 'non it') : j.category.toLowerCase() === category)) &&
    (!type || j.type.toLowerCase() === type)
  );
  res.json({ jobs, total: jobs.length });
});

app.get('/api/jobs/:id', async (req, res) => {
  const result = await query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ message: 'Job not found.' });
  res.json({ job: mapJob(result.rows[0]) });
});

app.post('/api/recruiter/profile', auth, async (req, res) => {
  if (req.user.role !== 'employer') return res.status(403).json({ message: 'Only recruiter accounts can use this feature.' });
  const { companyName, gstNumber = '', phone, email, registrationId = '', password } = req.body || {};
  if (!String(companyName || '').trim() || !String(phone || '').trim() || !String(email || '').trim() || !String(password || '')) return res.status(400).json({ message: 'Company name, phone, email and password are required.' });
  const result = await query('SELECT * FROM users WHERE id = $1', [req.user.sub]);
  const user = result.rows[0];
  if (!user) return res.status(404).json({ message: 'Recruiter account not found.' });
  if (!verifyPassword(password, user.password_hash)) return res.status(401).json({ message: 'Password is incorrect.' });
  try {
    const updated = await query(`UPDATE users SET company_name=$1,name=$1,phone=$2,email=$3,gst_number=$4,registration_id=$5 WHERE id=$6 RETURNING *`, [String(companyName).trim(),String(phone).trim(),cleanEmail(email),String(gstNumber||'').trim(),String(registrationId||'').trim(),user.id]);
    res.json({ user: publicUser(updated.rows[0]) });
  } catch (error) { if (error.code === '23505') return res.status(409).json({ message: 'That company email is already in use.' }); throw error; }
});

function recruiterCategoryMatch(job, filter) {
  const f = String(filter || '').toLowerCase();
  if (!f || f === 'all') return true;
  const hay = [job.category, job.title, ...(job.skills || [])].join(' ').toLowerCase();
  if (f === 'software') return /software|developer|development|programmer|react|node|full.?stack|frontend|backend|engineering|engineer|tech/.test(hay);
  if (f === 'it') return /\bit\b|information technology|software|developer|development|tech/.test(hay);
  if (f === 'non it') return !/\bit\b|information technology|software|developer|development|tech/.test(hay);
  return hay.includes(f);
}

app.get('/api/recruiter/jobs', auth, async (req, res) => {
  if (req.user.role !== 'employer') return res.status(403).json({ message: 'Only recruiter accounts can access this portal.' });
  const q = String(req.query.q || '').toLowerCase().trim();
  const category = String(req.query.category || '').trim();
  const jobsResult = await query('SELECT * FROM jobs WHERE created_by = $1 ORDER BY created_at DESC', [req.user.sub]);
  const jobIds = jobsResult.rows.map(r => r.id);
  const appsResult = jobIds.length ? await query('SELECT * FROM applications WHERE job_id = ANY($1::text[]) ORDER BY applied_at DESC', [jobIds]) : { rows: [] };
  const grouped = new Map(jobIds.map(id => [id, []]));
  for (const a of appsResult.rows) grouped.get(a.job_id)?.push(a);
  const jobs = jobsResult.rows.map(row => {
    const job = mapJob(row);
    const applications = (grouped.get(row.id) || []).map(a => ({ id:a.id, applicantName:a.applicant_name, email:a.email, phone:a.phone, experience:a.experience, currentLocation:a.current_location, resumeFileName:a.resume_file_name, hasResume:Boolean(a.resume_storage), appliedAt:a.applied_at }));
    return { ...job, applicationCount: applications.length, applications };
  }).filter(job => (!q || [job.title,job.company,job.location,job.category].join(' ').toLowerCase().includes(q)) && recruiterCategoryMatch(job, category));
  res.json({ jobs });
});

app.get('/api/recruiter/jobs/:jobId/applications/export', auth, async (req, res) => {
  if (req.user.role !== 'employer') return res.status(403).json({ message: 'Only recruiters can export applicants.' });
  const jobResult = await query('SELECT * FROM jobs WHERE id=$1 AND created_by=$2', [req.params.jobId, req.user.sub]);
  if (!jobResult.rowCount) return res.status(404).json({ message: 'Job not found or not owned by this recruiter.' });
  const job = mapJob(jobResult.rows[0]);
  const apps = await query('SELECT * FROM applications WHERE job_id=$1 ORDER BY applied_at DESC', [job.id]);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RRGBS';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Applicants');
  sheet.columns = [
    { header: 'Applicant Name', key: 'name', width: 24 }, { header: 'Email', key: 'email', width: 30 },
    { header: 'Phone', key: 'phone', width: 18 }, { header: 'Experience', key: 'experience', width: 18 },
    { header: 'Current Location', key: 'location', width: 24 }, { header: 'Resume', key: 'resume', width: 30 },
    { header: 'Applied At', key: 'appliedAt', width: 24 }, { header: 'Notes', key: 'notes', width: 40 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD71920' } };
  for (const a of apps.rows) sheet.addRow({ name:a.applicant_name, email:a.email, phone:a.phone, experience:a.experience, location:a.current_location, resume:a.resume_file_name || '', appliedAt:new Date(a.applied_at).toLocaleString('en-IN'), notes:a.notes || '' });
  const safeTitle = job.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 50) || 'job';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}-applicants.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

app.get('/api/recruiter/jobs/:jobId/applications/:applicationId/resume', auth, async (req, res) => {
  if (req.user.role !== 'employer') return res.status(403).json({ message: 'Only recruiters can download resumes.' });
  const result = await query(`SELECT a.* FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.id=$1 AND a.job_id=$2 AND j.created_by=$3`, [req.params.applicationId, req.params.jobId, req.user.sub]);
  const application = result.rows[0];
  if (!application || !application.resume_storage) return res.status(404).json({ message: 'Resume not available for this application.' });
  const storage = application.resume_storage;
  if (storage.provider !== 'cloudinary') return res.status(404).json({ message: 'Resume storage provider is unavailable.' });
  try {
    const signedUrl = cloudinary.utils.private_download_url(storage.publicId, storage.format || path.extname(storage.originalName || 'resume.pdf').slice(1) || 'pdf', { resource_type: 'raw', type: 'private', expires_at: Math.floor(Date.now()/1000) + 300 });
    const cloudinaryResponse = await fetch(signedUrl);
    if (!cloudinaryResponse.ok) {
      const detail = await cloudinaryResponse.text().catch(() => '');
      console.error('Cloudinary resume download failed:', cloudinaryResponse.status, detail.slice(0, 500));
      return res.status(502).json({ message: 'Cloudinary could not provide the resume file.' });
    }
    res.status(200);
    res.setHeader('Content-Type', cloudinaryResponse.headers.get('content-type') || storage.mime || 'application/octet-stream');
    const contentLength = cloudinaryResponse.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const originalName = String(storage.originalName || 'resume').replace(/[^a-zA-Z0-9._ -]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    if (!cloudinaryResponse.body) return res.status(502).json({ message: 'Resume file stream was empty.' });
    for await (const chunk of cloudinaryResponse.body) res.write(chunk);
    res.end();
  } catch (error) { console.error(error); res.status(502).json({ message: 'Could not generate a secure resume download.' }); }
});

app.post('/api/jobs', auth, async (req, res) => {
  if (req.user.role !== 'employer') return res.status(403).json({ message: 'Only employer accounts can post jobs.' });
  const body = req.body || {};
  const recruiterResult = await query('SELECT * FROM users WHERE id=$1', [req.user.sub]);
  const recruiter = recruiterResult.rows[0];
  if (!recruiter || !String(recruiter.company_name || '').trim() || !String(recruiter.phone || '').trim() || !String(recruiter.email || '').trim()) return res.status(400).json({ message: 'Please complete recruiter/company details before posting a job.' });
  if (validateRequired(body, ['title','company','location','category','type','experience','description'])) return res.status(400).json({ message: 'Please complete all required job fields.' });
  const job = {
    id: idempotentId('job'), title:String(body.title).trim(), company:String(body.company).trim(), companyLogoText:String(body.company).trim().slice(0,4).toUpperCase(),
    location:String(body.location).trim(), category:String(body.category).trim(), type:String(body.type), experience:String(body.experience).trim(), salary:String(body.salary || 'Best in Industry').trim(),
    description:String(body.description).trim(), skills:Array.isArray(body.skills)?body.skills:[], responsibilities:Array.isArray(body.responsibilities)?body.responsibilities:[], requirements:Array.isArray(body.requirements)?body.requirements:[], benefits:Array.isArray(body.benefits)?body.benefits:[], postedDate:'Just now', isFeatured:true,
  };
  await query(`INSERT INTO jobs (id,title,company,company_logo_text,location,category,type,experience,salary,description,skills,responsibilities,requirements,benefits,posted_date,is_featured,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16,$17)`, [job.id,job.title,job.company,job.companyLogoText,job.location,job.category,job.type,job.experience,job.salary,job.description,JSON.stringify(job.skills),JSON.stringify(job.responsibilities),JSON.stringify(job.requirements),JSON.stringify(job.benefits),job.postedDate,job.isFeatured,req.user.sub]);
  res.status(201).json({ job });
});

app.get('/api/saved-jobs', auth, async (req, res) => {
  const result = await query('SELECT job_id FROM saved_jobs WHERE user_id=$1', [req.user.sub]);
  res.json({ jobIds: result.rows.map(r => r.job_id) });
});
app.put('/api/saved-jobs/:jobId', auth, async (req, res) => {
  await query('INSERT INTO saved_jobs (user_id,job_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.sub, req.params.jobId]);
  res.json({ saved: true });
});
app.delete('/api/saved-jobs/:jobId', auth, async (req, res) => {
  await query('DELETE FROM saved_jobs WHERE user_id=$1 AND job_id=$2', [req.user.sub, req.params.jobId]);
  res.json({ saved: false });
});

app.post('/api/applications', async (req, res) => {
  const body = req.body || {};
  if (validateRequired(body, ['jobId','jobTitle','applicantName','email','phone','resumeFileName','resumeData'])) {
    return res.status(400).json({ message: 'Please complete all required application fields, including your resume.' });
  }
  try {
    const job = await query('SELECT * FROM jobs WHERE id=$1', [body.jobId]);
    if (!job.rowCount) return res.status(404).json({ message: 'This job is no longer available.' });

    // Fast duplicate check prevents unnecessary Cloudinary uploads. The unique
    // PostgreSQL index below remains the final race-safe protection.
    const normalizedEmail = cleanEmail(body.email);
    const duplicate = await query(
      'SELECT id FROM applications WHERE job_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1',
      [body.jobId, normalizedEmail]
    );
    if (duplicate.rowCount) {
      return res.status(409).json({ message: 'You have already applied for this job.' });
    }

    const storage = await uploadResumeToCloudinary(body.resumeFileName, body.resumeData, 'application');
    const application = { id:idempotentId('app'), jobId:body.jobId, jobTitle:String(body.jobTitle), company:String(body.company || job.rows[0].company), applicantName:String(body.applicantName).trim(), email:normalizedEmail, phone:String(body.phone).trim(), experience:String(body.experience||''), currentLocation:String(body.currentLocation||''), resumeFileName:String(body.resumeFileName||storage?.originalName||''), notes:String(body.notes||''), resumeStorage:storage };
    await query(`INSERT INTO applications (id,job_id,job_title,company,applicant_name,email,phone,experience,current_location,resume_file_name,resume_storage,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`, [application.id,application.jobId,application.jobTitle,application.company,application.applicantName,application.email,application.phone,application.experience,application.currentLocation,application.resumeFileName,storage ? JSON.stringify(storage) : null,application.notes]);
    res.status(201).json({ application: { ...application, resumeStorage: undefined } });
  } catch (error) {
    console.error(error);

    // PostgreSQL unique-constraint violation:
    // same candidate email cannot apply to the same job twice.
    if (error?.code === '23505' && error?.constraint === 'idx_applications_job_email_unique') {
      return res.status(409).json({
        message: 'You have already applied for this job.'
      });
    }

    res.status(400).json({
      message: error.message || 'Could not save application.'
    });
  }
});

app.post('/api/resumes', async (req, res) => {
  const body = req.body || {};
  if (validateRequired(body, ['name','email','phone'])) return res.status(400).json({ message: 'Name, email and phone are required.' });
  try {
    const storage = await uploadResumeToCloudinary(body.resumeFileName, body.resumeData, 'candidate');
    const resume = { id:idempotentId('resume'), name:String(body.name).trim(), email:cleanEmail(body.email), phone:String(body.phone).trim(), targetCategory:String(body.targetCategory||''), preferredCity:String(body.preferredCity||''), storage };
    await query(`INSERT INTO resumes (id,name,email,phone,target_category,preferred_city,file_storage) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [resume.id,resume.name,resume.email,resume.phone,resume.targetCategory,resume.preferredCity,storage?JSON.stringify(storage):null]);
    res.status(201).json({ resume: { ...resume, storage: undefined } });
  } catch (error) { res.status(400).json({ message: error.message || 'Could not save resume.' }); }
});

app.post('/api/contact', async (req, res) => {
  const body = req.body || {};
  if (validateRequired(body, ['name','phone','email'])) return res.status(400).json({ message: 'Name, phone and email are required.' });
  const inquiry = { id:idempotentId('inq'), name:String(body.name).trim(), company:String(body.company||'').trim(), email:cleanEmail(body.email), phone:String(body.phone).trim(), inquiryType:String(body.inquiryType||'General Staffing Inquiry').trim(), message:String(body.message||'').trim() };
  await query(`INSERT INTO contact_inquiries (id,name,company,email,phone,inquiry_type,message) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [inquiry.id,inquiry.name,inquiry.company,inquiry.email,inquiry.phone,inquiry.inquiryType,inquiry.message]);
  try {
    const email = buildContactEmail(inquiry); const result = await sendEmail({ to:emailTo, subject:`New RRGBS Business Enquiry - ${inquiry.inquiryType}`, ...email, replyTo:inquiry.email, idempotencyKey:`contact-${inquiry.id}` });
    res.status(201).json({ inquiry, emailSent: result.sent, emailError: result.sent ? undefined : result.reason });
  } catch (error) { console.error(error); res.status(201).json({ inquiry, emailSent:false, emailError:error.message }); }
});

app.post('/api/home-enquiries', async (req, res) => {
  const body = req.body || {};
  if (validateRequired(body, ['name','phone','service','location'])) return res.status(400).json({ message: 'Name, phone, service and location are required.' });
  const enquiry = { id:idempotentId('home'), name:String(body.name).trim(), phone:String(body.phone).trim(), email:String(body.email||'').trim(), service:String(body.service).trim(), location:String(body.location).trim(), message:String(body.message||'').trim() };
  await query(`INSERT INTO home_enquiries (id,name,phone,email,service,location,message) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [enquiry.id,enquiry.name,enquiry.phone,enquiry.email,enquiry.service,enquiry.location,enquiry.message]);
  let emailSent=false, emailError='';
  try { const email=buildHomeEmail(enquiry); const result=await sendEmail({to:emailTo,subject:`New RRGBS Home Service Enquiry - ${enquiry.service}`,...email,replyTo:enquiry.email||undefined,idempotencyKey:`home-${enquiry.id}`}); emailSent=result.sent; emailError=result.reason||''; } catch(error) { emailError=error.message; }
  const whatsappText = ['Hello RRGBS,','',`*HOME SERVICE ENQUIRY*`,`Name: ${enquiry.name}`,`Mobile: ${enquiry.phone}`,`Email: ${enquiry.email||'Not provided'}`,`Service: ${enquiry.service}`,`Location: ${enquiry.location}`,`Requirement: ${enquiry.message||'Please coordinate earliest.'}`].join('\n');
  res.status(201).json({ enquiry, emailSent, emailError: emailError || undefined, whatsappUrl:`https://wa.me/916363565865?text=${encodeURIComponent(whatsappText)}` });
});

app.post('/api/store/orders', async (req, res) => {
  const body=req.body||{};
  if (validateRequired(body,['customerName','customerPhone']) || !Array.isArray(body.items) || !body.items.length) return res.status(400).json({message:'Customer details and at least one cart item are required.'});
  const order={id:idempotentId('order'),customerName:String(body.customerName).trim(),customerPhone:String(body.customerPhone).trim(),customerEmail:String(body.customerEmail||'').trim(),customerLocation:String(body.customerLocation||'').trim(),customerMessage:String(body.customerMessage||'').trim(),items:body.items,totalAmount:Number(body.totalAmount||0),status:'new'};
  await query(`INSERT INTO store_orders (id,customer_name,customer_phone,customer_email,customer_location,customer_message,items,total_amount,status) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`, [order.id,order.customerName,order.customerPhone,order.customerEmail,order.customerLocation,order.customerMessage,JSON.stringify(order.items),order.totalAmount,order.status]);
  res.status(201).json({order});
});

app.post('/api/store/bulk-quotes', async (req, res) => {
  const body=req.body||{};
  if (validateRequired(body,['name','phone','category','message'])) return res.status(400).json({message:'Please complete the bulk quote form.'});
  const quote={id:idempotentId('bulk'),name:String(body.name).trim(),phone:String(body.phone).trim(),email:String(body.email||'').trim(),category:String(body.category).trim(),quantity:String(body.quantity||''),message:String(body.message).trim(),status:'new'};
  await query(`INSERT INTO bulk_quotes (id,name,phone,email,category,quantity,message,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [quote.id,quote.name,quote.phone,quote.email,quote.category,quote.quantity,quote.message,quote.status]);
  res.status(201).json({quote});
});

// Public, shareable job URL. The server renders job-specific social metadata so
// LinkedIn/X can generate a useful preview, then the browser continues into the SPA.
app.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM jobs WHERE id=$1', [req.params.jobId]);
    if (!result.rowCount) return next();

    const job = mapJob(result.rows[0]);
    const origin = getOrigin(req);
    const shareUrl = `${origin}/jobs/${encodeURIComponent(job.id)}`;
    const appUrl = `${origin}/?portal=jobs&jobId=${encodeURIComponent(job.id)}`;
    const title = `${job.title} at ${job.company} | RRGBS Jobs`;
    const description = `${job.title} at ${job.company} in ${job.location}. ${job.experience} • ${job.type} • ${job.salary}. View the complete job details and apply online with RRGBS.`;
    const imageUrl = `${origin}/rrgbs-logo.svg`;

    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <link rel="canonical" href="${escapeHtml(shareUrl)}">
</head>
<body>
  <script>window.location.replace(${JSON.stringify(appUrl)});</script>
  <noscript><p><a href="${escapeHtml(appUrl)}">Open the job and apply on RRGBS</a></p></noscript>
</body>
</html>`);
  } catch (error) {
    console.error('Shared job route failed:', error);
    next();
  }
});

if (isProduction) {
  const dist = path.join(ROOT, 'dist');
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => { if (req.path.startsWith('/api/')) return next(); res.sendFile(path.join(dist, 'index.html')); });
}

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ message: isProduction ? 'Internal server error.' : err.message }); });

async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => console.log(`RRGBS production API running on port ${PORT}`));
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }
}
start();
