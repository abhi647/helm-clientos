# Helm

Helm is the client delivery workspace for Seven Billion. Internal teams run projects, requests, approvals and updates. Customers get a portal that shows only what has been shared with them.

**Stack:** Next.js 16 (App Router, server actions) on **Vercel**, **Supabase** (Postgres + RLS, Auth magic links, Storage), **Resend** for notification emails, HubSpot and Zoho Books integrations.

## How it is put together

| Concern | Where | Notes |
|---|---|---|
| Access control | `supabase/migrations/*_rls.sql` | RLS on every table (forced). Customers see only `shared` rows of their own company. Commercials, estimates, time and integration tables are staff-only or service-only. |
| Workflows | `supabase/migrations/*_workflows.sql` | Triggers write events, action items, notifications and email-outbox rows. RPCs: `decide_approval`, `resubmit_approval`, `complete_action_item`, `set_request_status`, `publish_update`. Approval and request histories are append-only. |
| Auth | `src/proxy.ts`, `src/app/auth/*`, `src/app/login` | Invite-only magic links (signups are disabled). Profiles are created from `app_metadata`, which only the server can write. |
| Emails | `src/lib/email.ts`, `/api/cron/emails` | Transactional outbox: the database queues the email, the app sends it through Resend after the response (`after()`), with idempotency key `outbox-<id>`. A daily cron catches anything left over. Wording and layout are in `src/lib/email-copy.ts`: each email greets the person by first name, names their workspace, has a short line in Helm's voice for the kind of event ("Your call, Omar", "Green light", "Land ahoy"), a progress bar for requests, and a details box from the record (project, due date, effort, priority), showing only what that person may see. Each kind of event has its own colour banner with a wave edge, an icon, a P.S. and a sign-off; the PNG artwork is in `public/email/` and is rebuilt with `node scripts/email-art.mjs`. |
| Files | `src/components/upload.tsx`, `/api/documents/[id]` | The browser uploads straight to a private Storage bucket (this avoids Vercel's request size limit). Downloads use short-lived signed URLs. |
| HubSpot | `/api/webhooks/hubspot` | A deal moving to Closed Won becomes a pending engagement. The PM creates the project in one click from a template. |
| Zoho Books | `/api/cron/zoho-sync` | Invoices are read from Zoho and upserted. Amounts are shown exactly as Zoho reports them; the app never calculates invoice totals or tax. |
| Billing | `src/app/_actions/billing.ts`, `src/lib/integrations/zoho.ts` | Rate cards and billing statements, approved by the customer, become draft invoices in Zoho (rate × quantity per line; Zoho adds tax and totals). See **Billing** below. |
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
| `npm run test:e2e` | 18 Playwright flows, including phone-width checks (staff complete two-step sign-in; set `CLAMAV_HOST` to run the virus-scan flow) (needs `npm run build && npm start` first). Set `PW_CHROMIUM_PATH` to use a pre-installed Chromium. |

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
5. In **Authentication → Emails**, paste `supabase/templates/magic_link.html` and `invite.html` into the Magic Link and Invite user templates. They use `token_hash` links, which work across devices. Set the subjects to "Your way into Helm" and "Welcome aboard: your Helm workspace is ready". Both greet the person by first name and name their workspace ("Hi Omar, here is your way into the Nesma Group workspace"); migration 016 keeps `first_name` and `workspace` in each account's user metadata for this. The images point at `https://helm.sevenbillion.co` directly (not `{{ .SiteURL }}`), so they also show in the Supabase preview; change that address if you host Helm elsewhere. Keep the logo as PNG: SVG images don't show in Outlook and count against the message in spam filters.
   - Opening a link shows a "Continue" button; the link is only used when it is pressed. This stops email security scanners (Microsoft Safe Links and similar), which open every link first, from using it up.
   - Under **Authentication → Sign In / Providers → Email**, set "Email OTP Expiration" to `86400` (24 hours) so a late-arriving invite still works.
   - The sign-in email also carries a 6-digit code (`{{ .Token }}`). People using the installed app on a phone type the code instead of opening the link, because on iPhone a link opens in Safari, which doesn't share sign-in with the home-screen app.
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

### Staying signed in, and the phone app

- **Sessions last 30 days and renew while in use.** The sign-in cookie lives 30 days (`src/lib/supabase/session-cookie.ts`), and each visit refreshes it. Someone who opens Helm at least once a month never signs in again on that device; after 30 days away they sign in once more. Removing someone in Admin still cuts them off at once, because every request checks their access in the database.
- Leave **Authentication → Sessions** at its defaults (JWT expiry 3600 s; refresh tokens don't expire). On a paid plan you can set "Inactivity timeout" to 30 days as a server-side backstop.
- Staff still enter their authenticator code at each new sign-in, not on every visit.
- **Install it as an app.** iPhone: open Helm in Safari → Share → *Add to Home Screen*. Android/Chrome/Edge: menu → *Install app*. It opens full-screen with the Helm icon (`src/app/manifest.ts`). The service worker (`public/sw.js`) only caches the app's static files and shows an offline page when there is no signal; it never stores pages or customer data on the device.
- On phones, the staff sidebar becomes a menu button, the portal tabs scroll sideways, and wide tables scroll inside their cards.

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

### Test sign-ins for every role

To see Helm as each role, create one sign-in per role. All of them are "+" aliases of one mailbox you own, so every sign-in code arrives in your inbox. Nobody is emailed until you sign in.

```bash
node --env-file=.env.production.local scripts/test-users.mjs --email you@gmail.com
```

This creates admin, CEO, PM, consultant and finance staff, plus three customer users (an executive, a member, and a member with invoice access) under a separate customer, "Helm Test Co (test)", with one small project. Sign in at the login page with the 6-digit code. Staff set up an authenticator app the first time. Run it again with `--remove` to delete them all.

### 5. HubSpot (optional)

1. Create a private app with the scopes `crm.objects.deals.read`, `crm.objects.companies.read` and `crm.objects.contacts.read` (for the import's people to invite), and set `HUBSPOT_ACCESS_TOKEN`.
2. Under **Webhooks**, set the target URL to `https://<your-domain>/api/webhooks/hubspot` and subscribe to `deal.propertyChange` for `dealstage`.
3. Set `HUBSPOT_WEBHOOK_SECRET` to the app's client secret. Requests are checked with signature v3.
4. If your pipeline uses custom stage ids, list the Closed Won ones in `HUBSPOT_CLOSED_WON_STAGES`.

### 6. Zoho Books (optional)

1. In the [Zoho API console](https://api-console.zoho.in), create a Self Client.
2. Generate a code with scopes `ZohoBooks.invoices.READ,ZohoBooks.invoices.CREATE,ZohoBooks.customerpayments.READ` and exchange it for a refresh token. `invoices.CREATE` is only used to create **draft** invoices from approved billing statements.
3. Set the `ZOHO_*` variables. `ZOHO_DOMAIN` is the data centre, for example `zoho.in`.
4. Invoices and payments received are matched to customers by Zoho customer id, falling back to the customer name.
   - Draft and void invoices are never imported.
   - Finance can also press **Sync now**.
5. For billing statements, set each customer's **Zoho customer id** in Admin → Customers. Optionally put a Zoho **item id** on a rate card line so Zoho applies that item's tax and HSN/SAC code.

### Import from HubSpot & Zoho (Admin → Import)

A one-off backfill, which is also safe to re-run later. Admin and CEO only.

1. **Preview.** Helm reads HubSpot (won deals: from the stages in `HUBSPOT_CLOSED_WON_STAGES` onwards, in every pipeline) and Zoho (invoices). Nothing is written yet.
   - Each deal is a billing period, so deals are grouped into one project per customer and service line. The service line comes from the deal name, without the customer name, months, day ranges and invoice number: "DFM Foods BI Data Eng October (SBAPL/25-26/10)" → **BI Data Eng**.
   - Change any deal's project name to merge or split projects.
2. **Customers** are matched through the Zoho invoice number in the deal name. When an invoice number can't be matched, the deal's HubSpot company is used, then the company name. Existing Helm customers are reused, not duplicated.
3. **Projects** get their dates from their deals. A project is active if a deal is still in delivery or was billed in the last 120 days; otherwise it's completed. Projects have no PM yet; set one per project.
4. **Deals** are kept as each project's billing history (`project_deals`, Billing tab). **Zoho invoices and payments** are synced and linked to projects by invoice number. Both are admin, CEO and finance only.
5. **Contacts** from HubSpot are listed on each customer page as *People to invite*. Nobody is emailed until someone presses Send invitation. This needs the private app scope `crm.objects.contacts.read`.

Running the import again links what already exists and only adds new deals, projects, invoices and contacts.

**Start again:** `node --env-file=.env.production.local scripts/reset-imported.mjs` lists what the import created (its projects, the HubSpot/Zoho customers with no other projects, their invoices and contacts) and every customer login. Nothing is deleted until you add `--yes`. Staff logins, settings and anything made by hand stay.

### Billing: rate cards, statements and Zoho drafts

Every customer can be billed differently, and a project can mix models:

| Model | Rate card line | Each statement |
|---|---|---|
| Day rate per resource | role, rate per day, number of resources | days worked (pre-filled: resources × working days; finance adjusts, using the days logged that the statement shows) |
| Per delivery / milestone | deliverable, price | 1 for each delivery accepted in the period |
| Per unit delivered | unit (report, model…), rate, planned units | units delivered |
| Monthly retainer | fee per month | 1 (pre-filled) |

1. **Rate card** (project → Billing): admin, CEO or finance type the rates from the signed contract (currency, PO number, notes) and send it to the customer. Customer executives and anyone with invoice access approve it, or ask for changes with a reason. A new version replaces the live rates only once it is approved.
2. **Statement**: each period, finance creates a statement on the approved rates and enters the quantities. The statement shows the days the team logged on the project in that period. Rates can't be changed on a statement; the database copies them from the approved card.
3. **Approval**: the customer approves the statement in the portal (**Billing**), or asks for changes.
4. **Zoho**: on approval, Helm creates a **draft** invoice in Zoho Books, with one line per item at rate × quantity and the PO number as the reference. Finance reviews it, Zoho adds tax and numbering, and Finance sends it from Zoho. The next sync shows it on the Finance page and to the customer. If Zoho isn't connected, or the customer has no Zoho id, the statement shows the reason and a **Retry Zoho** button.

**Assigning work.** A task's owner is chosen when it is created and can be changed from the task panel on the plan. The new owner is notified (a template's tasks produce one notification per batch). A customer owner gets it on their home page; the to-do follows the task if it moves to a colleague, and closes if the task comes back to Seven Billion.

**Approve for the customer.** When something was already agreed (the signed contract, a call, an email), Seven Billion can approve it from its side instead of waiting on the portal: rate cards and statements (admin, CEO or finance; a statement's Zoho draft invoice follows straight away) and estimates (the PM, CEO or an admin). It is a deliberate step with an optional note on how the customer agreed; the record says it was approved by that person for the customer, and the customer is told by email for their records, with nothing left on their to-do list. The customer can still approve in the portal themselves. "Send" and "Approve" also stop if a line is still typed in "Add a line" but not added.

**Billing in any currency.** Each rate card has its own currency (INR, USD, AED, EUR, GBP, SAR, QAR, OMR, KWD, BHD, SGD, AUD, CAD, CHF, JPY); statements and the Zoho draft invoice use it, and amounts in different currencies are never added together. Zoho Books bills each customer in the currency set on that customer in Zoho: a first rate card starts in that currency, linking a customer shows it, and a statement in another currency is stopped before anything is created in Zoho, with what to change. To bill one company in two currencies, set up a Zoho customer for each currency.

**Customers and projects by hand, linked to HubSpot and Zoho.** Admins, the CEO and PMs can add a customer (Customers → + Add customer) and start a project (Projects → + New project, or from a customer's page) with a blank plan or a template. A customer's **HubSpot company id** and **Zoho Books customer id** can be set when it is added or later in its *HubSpot and Zoho* card; a project can carry a **HubSpot deal id**. Each id is checked against HubSpot or Zoho before it is saved (unless that integration isn't configured), a name left empty is filled in from the record found, and an id can only belong to one customer or project. Zoho invoices and payments follow the customer's Zoho id. A deal linked by hand also clears its pending set-up card on Home.

**Requests to tasks, and requests logged for a customer.** On any request, staff can **Turn into a task**: choose the project, owner, due date and estimate, and whether the task is **Shared** (the customer sees it on their plan and the request moves to Scheduled) or **Internal** (only Seven Billion sees it; the request's stage is unchanged). The request lists the tasks it became, and each task links back. **Requests → + Log a request** (or the button on a customer's page) records a request a customer gave verbally, on behalf of a named person at the customer or the company. It shows in their portal as "logged by … on their behalf", they are emailed, and the database refuses a "logged by" that isn't the person logging it.

**Effort uses the billing unit.** Task estimates and the estimates sent to customers for approval are entered in the project's rate card units: days for day-rate and retainer work, or the billed unit itself for delivery and unit lines ("2 dashboards", "3 reports"). With no rate card yet, effort is in days. Time is logged in days. The units come from `effort_units()`, which returns units only, so PMs can use it without seeing rates. Existing hours were converted at 8 hours = 1 day.

**Who sees money:** only admin, CEO and finance: rate cards, statements, the Finance page, Zoho invoices and payments. PMs and consultants see delivery (tasks, deliverables, requests) and days logged, never rates or amounts. On the customer side, executives and anyone with invoice access see their own company's sent rate cards and statements. This is enforced in the database (`supabase/migrations/*_billing*.sql`), and `tests/rls.test.ts` covers it.

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

## Product documents

`docs/` keeps the product documents from the first Helm prototype:

| Document | What it is |
|---|---|
| `7B-Client-OS-Refined-PRD.md` | The full target product and its release gates. |
| `Helm-Design-System.md`, `DESIGN.md` | The design contract and the reference it is based on. |
| `Rocketlane-Reference-Walkthrough.md` | The reference product walkthrough. |
| `Helm-Build-Coverage.md`, `Helm-Verification.md` | Coverage and verification notes for the **1 October browser prototype**, not for this build. |

That prototype stored its demo data in the browser. It remains in git history (commit `b35391c`) for reference. This repository's `main` is the production build described above: Supabase, row and field security, two-step sign-in, email, and the HubSpot and Zoho integrations.
