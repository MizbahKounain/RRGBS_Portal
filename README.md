# RRGBS – Reliable People, Professional Services

Production-oriented full-stack platform for **RR Group of Business Solutions (RRGBS)**.

The application combines:

- RRGBS business / workforce services
- Home service enquiries and WhatsApp actions
- Recruitment and job portal
- Candidate and recruiter authentication
- Recruiter verification and job posting
- Candidate applications and resume uploads
- Recruiter applicant management
- Secure resume downloads
- Per-job applicant Excel export
- Recruiter category filters (IT / Software / Non IT)
- Recruiter pricing packages
- Business store and enquiry flow
- Password reset using a transactional email API
- PostgreSQL persistence
- Cloudinary private cloud file storage
- Production email through Resend over HTTPS
- Responsive UI and page/card animations

## Architecture

```text
React + Vite
     |
     v
Express API
     |
     +-------------------- PostgreSQL
     |
     +-------------------- Cloudinary (private resume storage)
     |
     +-------------------- Resend (transactional email over HTTPS)
```

The server serves the compiled React app in production, so the normal deployment is a **single Render Web Service + PostgreSQL database**.

## Requirements

- Node.js 20+ recommended
- npm 10+ recommended
- PostgreSQL for local development or Render PostgreSQL for deployment
- Resend account/API key for production email
- Cloudinary account for persistent resume storage

## Local setup

```bash
npm install
```

Create `.env` from `.env.example` and configure at minimum:

```env
NODE_ENV=development
PORT=5000
JWT_SECRET=replace-with-a-long-random-secret
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

For resume uploads, configure Cloudinary:

```env
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

For email:

```env
RESEND_API_KEY=re_...
EMAIL_FROM=RRGBS <info@your-verified-domain.example>
EMAIL_TO=info@rrgroupofbusinesssolutions.in
```

Start the full application:

```bash
npm run dev:all
```

Production build:

```bash
npm run build
npm start
```

TypeScript check:

```bash
npm run lint
```

## Database

The application no longer uses `server/storage/db.json`.

On startup, the backend:

1. Connects to `DATABASE_URL`.
2. Creates the required PostgreSQL tables and indexes if they do not exist.
3. Seeds the initial public jobs from `server/seed-jobs.json` only when the jobs table is empty.

No manual table creation is required.

### Main tables

- `users`
- `jobs`
- `applications`
- `resumes`
- `saved_jobs`
- `contact_inquiries`
- `home_enquiries`
- `store_orders`
- `bulk_quotes`
- `password_resets`

For a Render Web Service and Render Postgres database in the same region, use the database's **internal connection string** for `DATABASE_URL`.

## Resume storage

Candidate resumes are not stored on the Render web-service filesystem.

They are uploaded to Cloudinary as private raw assets. The database stores the storage metadata, not the resume binary itself.

Recruiter resume downloads are authorized by the backend and a short-lived signed Cloudinary download URL is generated only after the recruiter is verified as the owner of the job.

## Email

SMTP/Nodemailer is intentionally not used for production transactional email.

The application uses **Resend's HTTPS email API** for:

- Password reset codes
- Business enquiries
- Home-service enquiry notifications

For production, verify the client's real sending domain in Resend and use an address such as:

```text
RRGBS <info@rrgroupofbusinesssolutions.in>
```

Never commit the Resend API key to GitHub.

## Recruiter portal

Recruiters can see only jobs created by their own recruiter account.

Each job provides:

- Applicant count
- Applicant list
- Individual resume download
- Download Applicants Excel

The Excel export includes:

- Applicant name
- Email
- Phone
- Experience
- Current location
- Resume filename
- Applied date/time
- Notes

Recruiter filters include:

- All
- IT
- Software
- Non IT

The pricing tab contains the client-provided Basic, Standard and Platinum packages.

## Store enquiry

The product **Enquire** action opens the enquiry dialog immediately in a top-level portal, rather than relying on the store page's scroll position. This avoids fixed-modal issues caused by transformed page containers.

## Render deployment

A `render.yaml` Blueprint is included.

### Blueprint deployment

1. Push the repository to GitHub.
2. Open Render.
3. Create a **Blueprint** from the repository.
4. Render creates:
   - `rrgbs` Web Service
   - `rrgbs-db` PostgreSQL
5. Render supplies `DATABASE_URL` from the PostgreSQL service.
6. Enter the secret values requested for Resend and Cloudinary.
7. Deploy.

The included Blueprint uses Free instances for testing. Render's current Free Postgres service is intended for testing and has lifecycle/storage limitations, so use an appropriate paid database plan for the final client deployment.

## Render environment variables

```text
NODE_ENV=production
JWT_SECRET=<generated by Render>
APP_ORIGIN=<Render service URL>
DATABASE_URL=<Render internal Postgres connection string>
RESEND_API_KEY=<secret>
EMAIL_FROM=<verified sender>
EMAIL_TO=info@rrgroupofbusinesssolutions.in
PASSWORD_RESET_TTL_MINUTES=15
CLOUDINARY_CLOUD_NAME=<secret/config>
CLOUDINARY_API_KEY=<secret/config>
CLOUDINARY_API_SECRET=<secret/config>
```

## Production checklist

Before handing the portal to the client:

- [ ] PostgreSQL is on a persistent paid production plan.
- [ ] Database backups / recovery policy is configured.
- [ ] Cloudinary production storage is configured.
- [ ] Resend sending domain is verified.
- [ ] `EMAIL_FROM` uses the verified client domain.
- [ ] `JWT_SECRET` is generated and private.
- [ ] No `.env` or credentials are committed to Git.
- [ ] Resume download authorization has been tested with two recruiter accounts.
- [ ] Candidate cannot access another candidate's resume.
- [ ] Recruiter cannot download applicants from another recruiter.
- [ ] Excel export is restricted to the job owner.
- [ ] Store enquiries work from product cards without scrolling.
- [ ] Password reset email/code flow has been tested.
- [ ] Contact and home-service enquiry notifications have been tested.
- [ ] Mobile layouts have been tested.
- [ ] Reduced-motion accessibility has been tested.
- [ ] Custom domain and HTTPS have been configured.

## Complete QA test plan

### 1. Health

Open:

```text
https://YOUR-RENDER-URL/api/health
```

Expected:

```json
{
  "ok": true,
  "database": "connected"
}
```

Also confirm `emailConfigured` and `resumeStorageConfigured` are `true` after their services are configured.

### 2. Candidate account

- Register a candidate.
- Log out.
- Log in again.
- Test wrong password.
- Test forgot password.
- Receive the six-digit code.
- Reset the password.
- Log in using the new password.

### 3. Recruiter account

- Register recruiter.
- Complete recruiter verification.
- Confirm recruiter portal shows no unrelated jobs.
- Post a job.
- Confirm the job appears publicly.
- Refresh the page.
- Confirm the job remains.

### 4. Applications

- Apply as candidate.
- Upload a PDF resume.
- Confirm the application appears under the correct recruiter job.
- Download the resume as the owner recruiter.
- Confirm another recruiter cannot download it.

### 5. Excel export

- Open Recruiter Portal.
- Find the job.
- Click `Download Excel`.
- Open the `.xlsx` file.
- Confirm applicant details and applied date are present.
- Confirm another recruiter cannot export the job.

### 6. Recruiter filters

Test:

```text
All
IT
Software
Non IT
```

Also test the recruiter job search field.

### 7. Pricing

Open Recruiter Portal → Pricing and confirm:

- Basic — Rs 970 — 10 days
- Standard — Rs 1613 — 20 days
- Platinum — Rs 2350 — 30 days
- GST note and package terms

### 8. Home services

- Click a WhatsApp button.
- Confirm the correct service name is included in the WhatsApp message.
- Test the contact/enquiry flow separately.

### 9. Store

- Open Store.
- Click `Enquire` directly on a product card.
- Confirm the enquiry dialog appears immediately without scrolling.
- Submit an enquiry.
- Confirm the WhatsApp handoff.
- Test bulk quote.
- Test cart and quantity changes.

### 10. Mobile

Test at approximately:

- 360px
- 390px
- 768px
- Desktop width

Check menus, dialogs, tables, forms, pricing cards and Excel/resume actions.

## Security notes

- Never commit `.env`.
- Never expose Cloudinary API secrets in frontend code.
- Never expose the Resend API key in frontend code.
- Never expose password hashes.
- Resume files are private and accessed through authorized recruiter routes.
- Password reset codes expire and have a maximum number of verification attempts.
- Authentication and password reset endpoints are rate limited.
- HTTP security headers are enabled with Helmet.

## License

Proprietary software for RR Group of Business Solutions.

Unauthorized copying, redistribution or commercial use is not permitted without permission from the project owner.


## Production integrations

- **Resend testing:** set `EMAIL_FROM=onboarding@resend.dev` while testing with the Resend test sender. For real RRGBS mail, verify `rrgroupofbusinesssolutions.in` in Resend and use a sender on that verified domain (for example `info@rrgroupofbusinesssolutions.in`).
- **Cloudinary resumes:** newly uploaded resumes are stored as private raw assets in the `rrgbs/resumes` Media Library folder. Applications use the `application-...` prefix and resume registrations use the `candidate-...` prefix.
- **Resume downloads:** the recruiter endpoint now proxies the signed Cloudinary file through the RRGBS API, avoiding browser CORS failures caused by redirecting `fetch()` to Cloudinary.
- **Jobs:** the Jobs hero now includes a **Non IT** popular filter.
