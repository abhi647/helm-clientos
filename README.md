# Helm

Helm is the client delivery workspace for Seven Billion. Internal teams run projects, requests, approvals and updates. Customers get a portal that shows only what has been shared with them.

**Stack:** Next.js 16 (App Router, server actions) on **Vercel**, **Supabase** (Postgres + RLS, Auth magic links, Storage), **Resend** for notification emails, HubSpot and Zoho Books integrations.

## How it is put together

| Concern | Where | Notes |
|---|---|---|
| Access control | `supabase/migrations/*_rls.sql` | RLS on every table (forced). Customers see only `shared` rows of their own company. Commercials, estimates, time and integration tables are staff-only or service-only. |
| Workflows | `supabase/migrations/*_workflows.sql` | Triggers write events, action items, notifications and email-outbox rows. RPCs: `decide_approval`, `resubmit_approval`, `complete_action_item`, `set_request_status`, `publish_update`. Approval and request histories are append-only. |
| Auth | `src/proxy.ts`, `src/app/auth/*`, `src/app/login` | Invite-only magic links (signups are disabled). Profiles are created from `app_metadata`, which only the server can write. |
| Emails | `src/lib/email.ts`, `/api/cron/emails` | Transactional outbox: the database queues the email, the app sends it through Resend after the response (`after()`), with idempotency key `outbox-<id>`. A daily cron catches anything left over. |
| Files | `src/components/upload.tsx`, `/api/documents/[id]` | The browser uploads straight to a private Storage bucket (this avoids Vercel's request size limit). Downloads use short-lived signed URLs. |
| HubSpot | `/api/webhooks/hubspot` | A deal moving to Closed Won becomes a pending engagement. The PM creates the project in one click from a template. |
| Zoho Books | `/api/cron/zoho-sync` | Invoices are read from Zoho and upserted. Amounts are shown exactly as Zoho reports them; the app never calculates money. |
| Playbook automations | `supabase/migrations/*_mvp_completion.sql`, Admin screen | Six database rules (see below). Each can be switched off per organisation in **Admin**, and each run is logged as an internal activity entry. |
| Meetings | `/projects/[id]/meetings`, `/meetings/[id]`, `/portal/meetings` | Notes, action lines that become plan tasks in one click (customer-owned ones land on the customer's home page), and decisions numbered `DEC-xxx`. |
| Forms | `src/lib/forms.ts`, `/portal/forms/[key]`, project **Forms** tab | Kickoff, Data access, UAT feedback and Project closure are stored as submissions. New, Change and Access requests use the request lifecycle. A form builder is phase 2. |
| @mentions | `src/components/mention-textarea.tsx` | `cmdk` picker anchored at the caret (`textarea-caret`). The database keeps a mention only if that person can read the comment. |
| Documents | `add_document_version` RPC | New versions keep the earlier files in history, and they're downloadable with `?v=N`. |
| CSAT & feedback | `supabase/migrations/*_csat_feedback.sql`, `/feedback`, `/portal/feedback` | 1-5 ratings are asked when a request is delivered, once a month (pulse, sent by the daily cron) and at project closure. A score of 1-2 opens a follow-up for the account owner. Customers can send feedback any time, and the team triages it in an inbox and replies. CSAT % = answers scored 4-5 ÷ all answers. |
| Navigation | `src/components/shell/command-palette.tsx` | ⌘K / Ctrl+K jumps to any page, project, customer or open request (`cmdk`). |
| UI | `src/app/globals.css`, `src/components/ui.tsx` | Compact enterprise design system: IBM Plex, 13 px body, 32 px rows, and an indicator palette checked for colour blindness. |

### Playbook rules

| When | Then |
|---|---|
| Kickoff form submitted | Data access form sent to the customer lead |
| First task in a UAT phase starts | UAT feedback form sent to the customer lead |
| All Seven Billion UAT tasks done, or the customer accepts UAT | UAT sign-off approval requested from the customer lead |
| UAT feedback reports issues | A bug request is raised (critical if blocking) |
| Project health turns At Risk | PM and CEO notified |
| A request is raised as critical | PM and the customer's account owner notified |
| Project marked Completed | Closure form sent to the customer lead |
| A request is delivered | The requester is asked for a CSAT rating |
| Once a month (daily cron, idempotent) | Every customer user gets a CSAT check-in |
| A CSAT score of 1 or 2 | A follow-up feedback item for the account owner, and the PM and account owner are alerted |

### Who sees which home

- **CEO / PM:** the exceptions view and the portfolio.
- **Consultant:** My Work.
- **Finance:** invoices and payments.
- **Customer executive:** engagement status, decisions waiting on them, recent decisions, deliverables and commercial status. They can also open their team's action centre.
- **Customer team member:** the action centre.

Routes: staff pages live under `src/app/(internal)` (`/home`, `/projects`, `/requests`, `/my-work`, `/finance`, `/customers`, `/inbox`). The customer portal lives under `/portal`.

## Local development

You need Node 20+, Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
npm ci
supabase start                      # Postgres, Auth, Storage, Mailpit on :54324
cp .env.example .env.local          # fill the Supabase values from `supabase status -o env`
npm run seed                        # demo org, customers, projects and users (local only)
docker run -d -p 3310:3310 clamav/clamav:stable   # optional: virus scanning (set CLAMAV_HOST=127.0.0.1)
npm run dev
```

1. Sign in with a seeded email, for example `rahul@example.com` (PM), `abhijit@example.com` (CEO) or `michel@nesma.example.com` (customer).
2. Open the magic link in Mailpit at http://127.0.0.1:54324.
3. Staff accounts then set up two-step sign-in: scan the QR code with any authenticator app, or type the setup key.

| Command | What it does |
|---|---|
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run test:db` | 79 row, field, two-step, lock-out, file, playbook and CSAT tests against the local database |
| `npm run test:e2e` | 11 Playwright flows (staff complete two-step sign-in; set `CLAMAV_HOST` to run the virus-scan flow) (needs `npm run build && npm start` first). Set `PW_CHROMIUM_PATH` to use a pre-installed Chromium. |

CI (`.github/workflows/ci.yml`) runs lint, types, the database tests and the flows on every push to `main` and on every pull request. It uses a throwaway local Supabase and a ClamAV service.
| `npm run db:types` | Regenerate `src/lib/database.types.ts` after a migration |

## Going live

### 1. Supabase

1. Create a project. Pick the Mumbai region (`ap-south-1`) to sit next to the Vercel region `bom1`.
2. Push the schema:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
3. In **Authentication → Sign In / Providers**, turn off "Allow new users to sign up". Only invited users can sign in.
4. In **Authentication → URL Configuration**:
   - Set the Site URL to `https://<your-domain>`.
   - Add `https://<your-domain>/auth/confirm` to the redirect URLs.
5. In **Authentication → Emails**, paste `supabase/templates/magic_link.html` and `invite.html` into the Magic Link and Invite user templates. They use `token_hash` links, which work across devices. Set the subjects to "Your sign-in link for Helm" and "You are invited to Helm by Seven Billion".
6. In **Authentication → Emails → SMTP Settings**, send auth emails through Resend. Supabase's built-in sender is rate-limited and is for testing only.

   | Field | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | User | `resend` |
   | Password | your Resend API key |

7. Optional: **Google sign-in for your team**.
   - In Google Cloud, create an OAuth client with the redirect URI `https://<ref>.supabase.co/auth/v1/callback`.
   - Enable the Google provider in **Authentication → Sign In / Providers**.
   - Set `NEXT_PUBLIC_GOOGLE_SIGNIN=true`.

   Sign-ups stay off, so only people you have invited can sign in with Google.

### 2. Resend

1. Add and verify your sending domain (SPF and DKIM DNS records).
2. Create an API key with "Sending access".
3. Set `EMAIL_FROM` to an address on that domain.

### 3. Vercel

1. Import the repository. The app is at the repository root, so leave the root directory as is.
2. Add every variable from `.env.example` under **Settings → Environment Variables**:
   - `NEXT_PUBLIC_SITE_URL` is your production URL.
   - `SUPABASE_SECRET_KEY` is the secret key from **Supabase → Project Settings → API Keys**.
   - `CRON_SECRET` is any random string of 32 or more characters.
3. Deploy. `vercel.json` sets the region to `bom1` and adds two daily crons: email retry and Zoho sync. On the Pro plan you can make them more frequent, for example `*/10 * * * *`.

### 4. First admin

Run this once from your computer. It creates the organisation and emails you an invitation:

```bash
# .env.production.local holds NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and NEXT_PUBLIC_SITE_URL
# for production. The file is ignored by git; never commit it.
npm run bootstrap -- --email you@sevenbillion.co --name "Your Name"
```

Open the email link, set up two-step sign-in with an authenticator app, and you're in. Everything else happens in the app:
- **Admin:** invite colleagues, set roles or remove access, add customers and account owners, switch playbook rules, check security and integrations.
- **Customers:** invite their people from each customer page.

### 5. HubSpot (optional)

1. Create a private app with the scopes `crm.objects.deals.read` and `crm.objects.companies.read`, and set `HUBSPOT_ACCESS_TOKEN`.
2. Under **Webhooks**, set the target URL to `https://<your-domain>/api/webhooks/hubspot` and subscribe to `deal.propertyChange` for `dealstage`.
3. Set `HUBSPOT_WEBHOOK_SECRET` to the app's client secret. Requests are checked with signature v3.
4. If your pipeline uses custom stage ids, list the Closed Won ones in `HUBSPOT_CLOSED_WON_STAGES`.

### 6. Zoho Books (optional)

1. In the [Zoho API console](https://api-console.zoho.in), create a Self Client.
2. Generate a code with scopes `ZohoBooks.invoices.READ,ZohoBooks.customerpayments.READ` and exchange it for a refresh token.
3. Set the `ZOHO_*` variables. `ZOHO_DOMAIN` is the data centre, for example `zoho.in`.
4. Invoices and payments received are matched to customers by Zoho customer id, falling back to the customer name.
   - Draft and void invoices are never imported.
   - Finance can also press **Sync now**.

## Security notes

Access is enforced inside Postgres at two levels, so a bug in a page cannot leak data.

- **Rows (RLS on every table, forced):** customers only see Shared rows of their own company. Commercials, estimates, time and integration tables are staff-only.
- **Fields (column privileges):** sensitive columns can't be read through the tables by any signed-in user. Asking for one fails with "permission denied".

  | Table | Hidden fields |
  |---|---|
  | `profiles` | email, organisation, internal role, customer role, invoice access |
  | `customers` | organisation, HubSpot and Zoho ids, account owner |
  | `projects` | template, HubSpot deal id |

  - Staff read these through `directory`, `customers_internal` and `projects_internal`, which return rows only to Seven Billion staff of that customer.
  - Each person reads their own full profile through `get_my_profile()`.
- **Inside a customer:**
  - A low-CSAT follow-up and its replies are visible only to the person who gave the score.
  - Form answers are visible to whoever submitted them and to the customer's executives.
  - CSAT answers are visible only to the person who was asked.

- **Two-step sign-in for staff:** every Seven Billion sign-in needs an authenticator-app code (TOTP). The database enforces it as well as the app: a staff session without the code sees no staff data at all. Customers sign in with an email link.
- **Instant lock-out:**
  - "Remove access" (Admin for staff, the customer page for customer users) blocks every database check from the person's next click, ends all their sessions and stops them signing in again.
  - Their name stays on history.
- **Files:**
  - Only PDF, Office, CSV, text, images and ZIP files are accepted, up to 50 MB; the storage bucket enforces this.
  - Each file's content must match its extension.
  - With `CLAMAV_HOST` set, every upload is virus-scanned before anyone can open it. A failed file is deleted, the uploader is told, and the event is logged.
  - PDFs and images can be previewed. They're served from the storage domain on a 60-second link, never from the app.
  - Staff can archive files, which hides them from the customer.
  - Requests have their own file area.

`tests/rls.test.ts` checks every one of these rules (79 tests). It signs in as customers, as staff (with a real TOTP code), as staff without two-step sign-in, and as anonymous callers.

### Before real customers: go-live checklist

| | Where | What |
|---|---|---|
| 1 | Supabase → Authentication → Multi-Factor | Confirm **TOTP (authenticator app)** is enabled. The app asks each staff member to set it up at their next sign-in, and Admin → Security lists anyone who hasn't yet. |
| 2 | Hosting for ClamAV | Run the official `clamav/clamav` Docker image on a private network (Fly.io, Railway, a small VM). Set `CLAMAV_HOST`, then set `REQUIRE_VIRUS_SCAN=true` so nothing opens unscanned. Don't expose port 3310 publicly; restrict it to Vercel's egress or a private network. |
| 3 | Supabase → Database → Backups | Turn on **Point-in-Time Recovery** (Pro plan add-on), which allows restoring to any second in the retention window. Daily backups alone can lose up to a day. |
| 4 | Supabase project region | Pick the region at creation; it can't be moved later. Mumbai (`ap-south-1`) is next to Vercel `bom1`. If a customer's contract requires their data to stay in a specific country or region, check Supabase's region list before creating the project. |
| 5 | Supabase → Authentication → URL configuration and Rate limits | Use only your production domain for redirects. Keep the default sign-in rate limits. |
| 6 | Vercel | Mark the server-only keys (`SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `ZOHO_*`, `HUBSPOT_*`) as **Sensitive**. Never prefix them with `NEXT_PUBLIC_`. |

- The secret key is server-only (`src/lib/supabase/admin.ts` imports `server-only`). It is used for the email outbox, integrations and invites.
- Access is decided in the database, so a bug in a page cannot leak another customer's data. `tests/rls.test.ts` proves this, including attempts to forge requests, post internal comments as a customer, or escalate a profile.
- Customers can never write internal content. A comment on an internal item is forced internal by a trigger.
- The seed script refuses to run against anything but a local database.
