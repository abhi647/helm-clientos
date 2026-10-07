// The core loops from the PRD, driven through the real UI with real magic-link sign-in (emails caught by Mailpit).
// Run: supabase start && npm run seed && npm run build && npm start, then npm run test:e2e
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import * as OTPAuth from 'otpauth'

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'
const SHOTS = process.env.E2E_SCREENSHOTS

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

async function latestLink(email: string, after: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    const json = (await res.json()) as { messages: { ID: string; Created: string }[] }
    const msg = json.messages.find((m) => Date.parse(m.Created) >= after - 2000)
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { HTML: string }
      const href = full.HTML.match(/href="([^"]*token_hash[^"]*)"/)?.[1]
      if (href) return href.replace(/&amp;/g, '&')
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No sign-in email for ${email}`)
}

async function latestCode(email: string, after: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    const json = (await res.json()) as { messages: { ID: string; Created: string }[] }
    const msg = json.messages.find((m) => Date.parse(m.Created) >= after - 2000)
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { Text: string; HTML: string }
      const code = (full.Text || full.HTML.replace(/<[^>]+>/g, ' ')).match(/\b(\d{6,10})\b/)?.[1]
      if (code) return code
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No sign-in code for ${email}`)
}

// authenticator secrets of staff who set up two-step sign-in during this run
const totp = new Map<string, string>()

async function signIn(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  const started = Date.now()
  await page.getByLabel('Work email').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByText('Check your inbox')).toBeVisible()
  const link = await latestLink(email, started)
  // a mail scanner (e.g. Microsoft Safe Links) opens the link first: that must not use it up
  await page.request.get(link)
  await page.goto(link)
  await page.getByRole('button', { name: /^(Continue|Open your workspace)$/ }).click()
  // "/" redirects on to the right home (or to /mfa for staff)
  await page.waitForURL((u) => !u.pathname.startsWith('/auth') && u.pathname !== '/')
  if (!page.url().includes('/mfa')) return
  // staff: set up the authenticator the first time, then enter the current code
  const heading = page.getByRole('heading', { name: /Set up two-step sign-in|Enter your code/ })
  await expect(heading).toBeVisible()
  if ((await heading.textContent())?.startsWith('Set up')) {
    totp.set(email, (await page.getByTestId('totp-secret').textContent())!.trim())
    await shot(page, '00-mfa-setup')
  }
  const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(totp.get(email)!) }).generate()
  await page.getByLabel('6-digit code').fill(code)
  await page.getByRole('button', { name: /Turn on and continue|Continue/ }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/mfa'))
}

test.beforeAll(() => {
  execSync('node --env-file=.env.local scripts/seed.mjs', { stdio: 'ignore' })
})

test('unknown emails get the same answer and no link', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Work email').fill('stranger@nowhere.example.com')
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByText('Check your inbox')).toBeVisible()
  await shot(page, '01-login')
})

test('customer team member: action centre', async ({ page }) => {
  await signIn(page, 'omar@nesma.example.com')
  await expect(page).toHaveURL(/\/portal$/)
  await expect(page.getByRole('heading', { name: /, Omar$/ })).toBeVisible()
  await expect(page.getByText(/items? need your attention|Nothing needs your attention/)).toBeVisible()
  await shot(page, '02-portal-home')
})

test('customer executive: status view, request changes, raise a request', async ({ page }) => {
  await signIn(page, 'michel@nesma.example.com')
  await expect(page).toHaveURL(/\/portal$/)
  await expect(page.getByRole('heading', { name: /, Michel$/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Engagement status' })).toBeVisible()
  await shot(page, '02b-portal-exec')

  // the approval opens the request, where only the named approver can decide
  await page.getByRole('link', { name: 'Review & approve' }).click()
  await expect(page.getByText('Approval · estimate')).toBeVisible()
  await expect(page.getByText('Region master is missing')).toHaveCount(0)        // internal comment never reaches the customer
  await page.getByLabel('Comment (needed to request changes)').fill('Please include the 3 missing territories.')
  await page.getByRole('button', { name: 'Request changes' }).click()
  // the card re-renders into its new state; the history is the confirmation
  await expect(page.getByText('Changes requested · v1 · Michel')).toBeVisible()
  await expect(page.getByText('“Please include the 3 missing territories.”')).toBeVisible()
  await shot(page, '03-portal-request-changes')

  // raise a new request and get a reference straight away
  await page.goto('/portal/requests/new')
  await page.getByLabel('Title').fill('Weekly stock cover report')
  await page.getByLabel('What do you need?').fill('Stock cover in days by warehouse, refreshed weekly.')
  await page.getByRole('button', { name: 'Submit request' }).click()
  await expect(page.getByText(/REQ-\d+ created/)).toBeVisible()
  await shot(page, '04-portal-new-request')
})

test('PM: resubmits, posts internal and shared comments, previews as customer', async ({ page }) => {
  await signIn(page, 'rahul@example.com')
  await expect(page).toHaveURL(/\/home$/)
  await expect(page.getByRole('heading', { name: /Needs attention/ })).toBeVisible()
  await shot(page, '05-home')

  await page.goto('/inbox?tab=all')
  await expect(page.getByText(/Michel requested changes/)).toBeVisible()
  await page.getByText(/Michel requested changes/).click()
  await page.getByText(/Revise and resubmit/).isVisible()
  await page.getByLabel('Effort in days').fill('6')
  await page.getByLabel('What changed').fill('Added the 3 territories')
  await page.getByRole('button', { name: 'Resubmit' }).click()
  await expect(page.getByText('Resubmitted · v2 · Rahul')).toBeVisible()
  await shot(page, '06-request-staff')

  await page.goto('/projects')
  await page.getByRole('link', { name: 'Power BI Implementation' }).click()
  await page.getByRole('link', { name: 'Data mapping' }).click()
  const reply = page.getByLabel('Reply')
  await reply.fill('Internal: keep the OData fallback warm.')
  await page.getByRole('button', { name: 'Post' }).click()
  await expect(page.getByText('Internal: keep the OData fallback warm.')).toBeVisible()
  await expect(reply).toHaveValue('')   // the box empties once the post is saved
  await page.getByRole('radio', { name: 'Shared with customer' }).click()
  await reply.fill('Shared: validation results are attached.')
  await page.getByRole('button', { name: 'Post' }).click()
  await expect(page.getByText('Shared: validation results are attached.')).toBeVisible()
  await shot(page, '07-project-plan')

  await page.getByRole('link', { name: 'Customer preview' }).click()
  await expect(page.getByText('API fallback spike')).toHaveCount(0)
  await expect(page.getByText('Internal QA')).toHaveCount(0)
  await shot(page, '08-customer-preview')

  await page.goto('/my-work')
  await expect(page.getByRole('heading', { name: 'My Work' })).toBeVisible()
  await shot(page, '09-my-work')
})

test('customer approves v2 and sees only shared discussion', async ({ page }) => {
  await signIn(page, 'michel@nesma.example.com')
  await page.getByRole('link', { name: 'Review & approve' }).click()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Approved · v2 · Michel')).toBeVisible()
  await expect(page.getByText('Resubmitted · v2 · Rahul')).toBeVisible()

  await page.goto('/portal')
  await page.locator('.row', { hasText: 'Power BI Implementation' }).getByRole('link', { name: 'Open' }).click()
  await page.getByRole('link', { name: 'Data mapping' }).click()
  await expect(page.getByText('Shared: validation results are attached.')).toBeVisible()
  await expect(page.getByText('Internal: keep the OData fallback warm.')).toHaveCount(0)
  await expect(page.getByText('API fallback spike')).toHaveCount(0)
  await shot(page, '10-portal-project')
})

test('PM: meeting action becomes a task, @mention, send a form', async ({ page }) => {
  await signIn(page, 'rahul@example.com')
  await page.goto('/projects')
  await page.getByRole('link', { name: 'Power BI Implementation' }).click()
  await page.getByRole('link', { name: 'Meetings' }).click()
  await page.getByRole('link', { name: /Weekly project review/ }).click()
  await page.locator('.row', { hasText: 'Draft the UAT test scenarios' }).getByRole('button', { name: 'Create task' }).click()
  await expect(page.locator('.row', { hasText: 'Draft the UAT test scenarios' }).getByText('In the plan →')).toBeVisible()

  const reply = page.getByLabel('Reply')
  await reply.fill('@Mi')
  await page.getByRole('listbox').getByRole('option', { name: /Michel/ }).click()
  await reply.pressSequentially('please confirm the hierarchy by Friday')
  await page.getByRole('button', { name: 'Post' }).click()
  await expect(page.locator('p', { hasText: 'please confirm the hierarchy by Friday' }).locator('b', { hasText: '@Michel' })).toBeVisible()
  await shot(page, '13-meeting')

  await page.goto('/projects')
  await page.getByRole('link', { name: 'Power BI Implementation' }).click()
  await page.getByRole('link', { name: 'Forms' }).click()
  await page.locator('.row', { hasText: 'UAT feedback' }).getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('UAT feedback form sent.')).toBeVisible()
  await shot(page, '14-forms')
})

test('customer executive fills in the UAT form and sees the mention', async ({ page }) => {
  await signIn(page, 'michel@nesma.example.com')
  await page.goto('/portal?view=actions')
  await page.getByRole('link', { name: 'Give feedback' }).first().click()
  await page.getByLabel('Accepted: ready to sign off').check()
  await page.getByLabel('Tested by *').fill('Michel and Omar')
  await shot(page, '15-portal-form')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('Thank you. Your UAT feedback form was sent to Seven Billion.')).toBeVisible()
  // accepting UAT asks for sign-off automatically
  await expect(page.getByText('UAT sign-off: Power BI Implementation')).toBeVisible()
  await page.goto('/portal/inbox')
  await expect(page.getByText('Rahul mentioned you')).toBeVisible()
})

test('admin switches a playbook rule', async ({ page }) => {
  await signIn(page, 'admin@example.com')
  await page.goto('/admin')
  const rule = page.locator('.row', { hasText: 'Project is marked Completed' })
  await rule.getByRole('switch').click()
  await expect(rule.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  await shot(page, '16-admin')
  await rule.getByRole('switch').click()
  await expect(rule.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
})

test('customer rates a delivery and sends feedback; the team triages it', async ({ page }) => {
  await signIn(page, 'omar@nesma.example.com')
  await expect(page.getByRole('heading', { name: 'Quick check-in' })).toBeVisible()
  await shot(page, '17-portal-csat')
  await page.getByRole('radio', { name: '4: Satisfied' }).first().click()
  await page.getByLabel('What went well? (optional)').fill('Fast and clear.')
  await page.getByRole('button', { name: 'Send rating' }).first().click()
  await expect(page.getByText('Thank you for the feedback.')).toBeVisible()

  await page.goto('/portal/feedback')
  await page.getByLabel('Your feedback').fill('Please add a glossary of the KPI definitions to the dashboard.')
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByText(/FB-\d+ was sent to your account owner/)).toBeVisible()

  await signIn(page, 'rahul@example.com')
  await page.goto('/feedback')
  await expect(page.getByRole('heading', { name: 'CSAT by month' })).toBeVisible()
  await shot(page, '18-csat-dashboard')
  await page.getByRole('link', { name: /glossary of the KPI definitions/ }).click()
  await page.getByLabel('Status').selectOption('acknowledged')
  await page.waitForTimeout(800)
  await page.reload()
  await expect(page.getByText('Acknowledged').first()).toBeVisible()
  await shot(page, '19-feedback-item')
})

test('uploads are type-checked and virus-scanned before anyone can open them', async ({ page }) => {
  await signIn(page, 'rahul@example.com')
  await page.goto('/projects')
  await page.getByRole('link', { name: 'Power BI Implementation' }).click()
  await page.getByRole('link', { name: 'Documents' }).click()
  const upload = async (name: string, mimeType: string, body: string) => {
    await page.getByLabel('File', { exact: true }).setInputFiles({ name, mimeType, buffer: Buffer.from(body) })
    await page.getByRole('button', { name: 'Upload', exact: true }).click()
  }
  await upload('Data dictionary.pdf', 'application/pdf', '%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF')
  await expect(page.getByText('Uploaded.', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Preview Data dictionary.pdf' })).toBeVisible()
  // the EICAR string is the industry-standard harmless test "virus"
  await upload('notes.txt', 'text/plain', 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')
  await expect(page.getByText('Blocked: the virus scan found a threat, so the file was deleted.')).toBeVisible()
  // a program renamed to .pdf is rejected by the content check
  await upload('invoice.pdf', 'application/pdf', 'MZ this is not a pdf')
  await expect(page.getByText('Blocked: the file content does not match its type, so it was deleted.')).toBeVisible()
  await page.reload()
  await shot(page, '20-documents-security')
})

test('CEO sees the portfolio and finance', async ({ page }) => {
  await signIn(page, 'abhijit@example.com')
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible()
  await page.goto('/finance')
  await expect(page.getByText('INV-1072')).toBeVisible()
  await shot(page, '11-finance')
  await page.goto('/customers')
  await page.getByRole('link', { name: /Nesma Group/ }).click()
  await shot(page, '12-customer')
})

test('CEO adds a customer, links it to HubSpot and Zoho, and starts projects by hand', async ({ page }) => {
  await signIn(page, 'abhijit@example.com')
  await page.goto('/customers')
  await page.getByText('+ Add customer').click()
  await page.getByLabel('Customer name').fill('Orbit Foods')
  await page.getByLabel('HubSpot company id').fill('9100001')
  await page.getByRole('button', { name: 'Add customer' }).click()
  await expect(page.getByRole('heading', { name: 'Orbit Foods' })).toBeVisible()
  await expect(page.getByText('HubSpot 9100001 · Not linked to Zoho')).toBeVisible()

  // link the Zoho customer afterwards (no integrations in tests, so the ids are saved as typed)
  await page.getByLabel('Zoho Books customer id').fill('7700001')
  await page.getByRole('button', { name: 'Save links' }).click()
  await expect(page.getByRole('status').getByText('Saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('HubSpot 9100001 · Zoho 7700001')).toBeVisible()
  await shot(page, '35-customer-links')

  // a blank project
  await page.getByRole('link', { name: '+ New project' }).click()
  await page.getByLabel('Project name').fill('Orbit pilot')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\?created=1/)
  await expect(page.getByRole('heading', { name: 'Orbit pilot' })).toBeVisible()
  await expect(page.getByText('Delivery').first()).toBeVisible()
  await shot(page, '36-new-project')

  // one from a template, linked to a HubSpot deal
  await page.goto('/projects/new')
  await page.getByRole('link', { name: 'Orbit Foods' }).click()
  await page.getByLabel('Project name').fill('Orbit dashboards')
  await page.getByLabel('Plan').selectOption({ index: 1 })
  await page.getByLabel('HubSpot deal id (optional)').fill('5500001')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Orbit dashboards' })).toBeVisible()

  // the same deal cannot be linked twice
  await page.goto('/projects/new')
  await page.getByRole('link', { name: 'Orbit Foods' }).click()
  await page.getByLabel('Project name').fill('Orbit again')
  await page.getByLabel('HubSpot deal id (optional)').fill('5500001')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByText('That HubSpot deal is already linked to another project.')).toBeVisible()

  // a consultant cannot start projects
  await signIn(page, 'sahil@example.com')
  await page.goto('/projects')
  await expect(page.getByRole('link', { name: '+ New project' })).toHaveCount(0)
})

test('system health: the uptime check answers, a background job is recorded, and the CEO sees both', async ({ page, request }) => {
  const health = await request.get('/api/health')
  expect(health.status()).toBe(200)
  expect(await health.json()).toMatchObject({ ok: true, db: 'ok' })
  const secret = readFileSync('.env.local', 'utf8').match(/^CRON_SECRET=(.*)$/m)![1]!.trim()
  expect((await request.get('/api/cron/emails')).status()).toBe(401)
  expect((await request.get('/api/cron/emails', { headers: { Authorization: `Bearer ${secret}` } })).status()).toBe(200)

  await signIn(page, 'abhijit@example.com')
  await page.goto('/admin')
  await page.getByRole('link', { name: 'System health' }).click()
  await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible()
  const emailsJob = page.locator('div', { hasText: /^Emails, surveys and file scans/ }).first()
  await expect(emailsJob.getByText('OK', { exact: true })).toBeVisible()
  await expect(page.getByText('Sent in the last 24 hours')).toBeVisible()
  await shot(page, '39-system-health')
})

test('deleting: a task and a phase from the plan, then the whole project after typing its name', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await signIn(page, 'abhijit@example.com')
  await page.goto('/projects')
  await page.getByRole('link', { name: 'Orbit dashboards' }).click()
  const tasks = page.locator('a[href*="?task="]')
  await expect(tasks.first()).toBeVisible()
  const before = await tasks.count()
  await tasks.first().click()
  await page.getByRole('button', { name: 'Delete task' }).click()
  await expect(page).not.toHaveURL(/task=/)
  await expect(tasks).toHaveCount(before - 1)
  await page.locator('summary', { hasText: 'Delete a phase…' }).click()
  const phases = page.locator('details[open]', { hasText: 'Delete a phase…' }).locator('.row')
  const phaseName = (await phases.first().locator('span').first().textContent())!.split(' · ')[0]!.trim()
  const phaseCount = await phases.count()
  await phases.first().getByRole('button', { name: 'Delete' }).click()
  await expect(phases).toHaveCount(phaseCount - 1)   // the phase (and its row) is gone
  await expect(page.locator('summary', { hasText: phaseName })).toHaveCount(0)

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByText('Delete Orbit dashboards and everything in it').click()
  await shot(page, '43-delete-project')
  await page.getByLabel('Type the project name to confirm').fill('orbit')
  await page.getByRole('button', { name: 'Delete for good' }).click()
  await expect(page.getByText('Type the project name exactly to confirm.')).toBeVisible()
  await page.getByLabel('Type the project name to confirm').fill('Orbit dashboards')
  await page.getByRole('button', { name: 'Delete for good' }).click()
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('link', { name: 'Orbit pilot' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Orbit dashboards' })).toHaveCount(0)

  // a PM can delete tasks but not projects
  await signIn(page, 'rahul@example.com')
  await page.goto('/projects')
  await page.getByRole('link', { name: 'Orbit pilot' }).click()
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0)
})

test('privacy and terms are public; the CEO exports a customer\'s data, then deletes the customer', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible()
  await page.getByRole('link', { name: 'Terms of use' }).click()
  await expect(page.getByRole('heading', { name: 'Terms of use' })).toBeVisible()
  await page.goto('/login')
  await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible()

  await signIn(page, 'abhijit@example.com')
  await page.goto('/customers')
  await page.getByRole('link', { name: /CBD Group/ }).click()
  const exportLink = page.getByRole('link', { name: 'Export all data' })
  const res = await page.request.get((await exportLink.getAttribute('href'))!)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-disposition']).toMatch(/attachment; filename="helm-cbd-group-/)
  const data = await res.json()
  expect(data.customer.name).toBe('CBD Group')
  expect(data.tables.projects.length).toBeGreaterThan(0)
  expect(data.people.length).toBeGreaterThan(0)

  await page.getByText('Delete CBD Group and all its data').click()
  await page.getByLabel("Type the customer's name to confirm").fill('CBD')
  await page.getByRole('button', { name: 'Delete for good' }).click()
  await expect(page.getByText('Type the customer\'s name exactly ("CBD Group") to confirm.')).toBeVisible()
  await page.getByLabel("Type the customer's name to confirm").fill('CBD Group')
  await page.getByRole('button', { name: 'Delete for good' }).click()
  await expect(page).toHaveURL(/\/customers$/)
  await expect(page.getByRole('link', { name: /CBD Group/ })).toHaveCount(0)

  // the delete is on record for the admins
  await page.goto('/admin/health')
  await expect(page.getByText(/deleted CBD Group and all its data/)).toBeVisible()
  // and nobody else can export
  await signIn(page, 'rahul@example.com')
  expect((await page.request.get(`/api/customers/${data.customer.id}/export`)).status()).toBe(403)
})

test('billing (finance only): rate card approved by the customer, a statement approved, then sent to Zoho', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  const openBilling = async () => {
    await page.goto('/customers')
    await page.getByRole('link', { name: /Nesma Group/ }).click()
    await page.getByRole('link', { name: 'Infor LN Integration' }).first().click()
    await page.getByRole('link', { name: 'Billing' }).click()
  }

  // finance sets the rates from the contract: a day rate and a per-delivery price
  await signIn(page, 'finance@example.com')
  await openBilling()
  await page.getByRole('button', { name: 'Start the rate card' }).click()
  const add = page.locator('form', { has: page.getByRole('button', { name: 'Add line' }) })
  await add.getByLabel('Role, delivery or unit').fill('Data engineer')
  await add.getByLabel('Rate', { exact: true }).fill('90')
  await add.getByLabel('Planned quantity').fill('2')
  await add.getByRole('button', { name: 'Add line' }).click()
  await expect(page.getByText('Line added.')).toBeVisible()
  // "Charged per" follows the billing model
  await add.getByLabel('Billing model').selectOption('retainer')
  await expect(add.getByLabel('Unit', { exact: true })).toHaveValue('month')
  await add.getByLabel('Billing model').selectOption('unit')
  await expect(add.getByLabel('Unit', { exact: true })).toHaveValue('')
  await add.getByLabel('Billing model').selectOption('delivery')
  await expect(add.getByLabel('Unit', { exact: true })).toHaveValue('delivery')
  await add.getByLabel('Role, delivery or unit').fill('Sales dashboard')
  await add.getByLabel('Rate', { exact: true }).fill('500')
  await add.getByRole('button', { name: 'Add line' }).click()
  await expect(page.locator('details summary', { hasText: 'Sales dashboard' }).first()).toBeVisible()
  await shot(page, '21-billing-rate-card')
  await page.getByRole('button', { name: 'Send to customer for approval' }).click()
  await expect(page.getByText('Waiting for customer')).toBeVisible()

  // the customer's executive approves the rates in the portal
  await signIn(page, 'michel@nesma.example.com')
  await page.goto('/portal/billing')
  const card = page.locator('.card', { hasText: 'Rates for Infor LN Integration' })
  await expect(card.getByText('Data engineer')).toBeVisible()
  await card.getByRole('button', { name: 'Approve' }).click()
  await expect(card).toHaveCount(0)   // moves from "waiting" to the approved rates
  await expect(page.locator('.card', { hasText: 'Approved rates' }).getByText('Data engineer')).toBeVisible()

  // the PM sees the project's delivery, but no billing at all
  await signIn(page, 'rahul@example.com')
  await page.goto('/customers')
  await page.getByRole('link', { name: /Nesma Group/ }).click()
  await page.getByRole('link', { name: 'Infor LN Integration' }).first().click()
  await expect(page.getByRole('link', { name: 'Plan', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Billing', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Finance', exact: true })).toHaveCount(0)

  // finance bills the month: days worked (checked against the hours logged) and the delivery accepted
  await signIn(page, 'finance@example.com')
  await openBilling()
  await page.getByRole('button', { name: 'New statement' }).click()
  await page.waitForURL(/\/billing\/[0-9a-f-]{36}$/)
  await page.getByLabel('Quantity for Data engineer').fill('38')
  await page.getByLabel('Note for Data engineer').fill('2 days leave')
  await page.getByLabel('Quantity for Sales dashboard').fill('1')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await expect(page.getByText('Days logged in this period')).toBeVisible()
  await shot(page, '22-billing-statement')
  await page.getByRole('button', { name: 'Send to customer for approval' }).click()
  await expect(page.getByText('Waiting for approval')).toBeVisible()
  const statementUrl = page.url()

  // the customer approves the statement; the server then creates the Zoho draft (Zoho is not connected locally)
  await signIn(page, 'michel@nesma.example.com')
  await page.goto('/portal/billing')
  const st = page.locator('.card', { hasText: 'Waiting for approval' })
  await expect(st.getByText('2 days leave')).toBeVisible()
  await shot(page, '23-portal-billing')
  await st.getByRole('button', { name: 'Approve' }).click()
  await expect(st).toHaveCount(0)
  await expect(page.locator('.card', { hasText: 'Statements' }).getByText('Approved', { exact: true })).toBeVisible()

  await signIn(page, 'finance@example.com')
  await expect(async () => {
    await page.goto(statementUrl)
    await expect(page.getByText(/Zoho is not connected|has no Zoho customer id/)).toBeVisible({ timeout: 1000 })   // never reaches the real Zoho
  }).toPass({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Retry Zoho' })).toBeVisible()
})

test('time to billing: logged, returned and approved, then billed once on the statement', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  // the consultant logs a full day and a half day on a task
  await signIn(page, 'sahil@example.com')
  await page.goto('/projects')
  await page.getByRole('link', { name: 'Management Reporting' }).click()
  await page.getByRole('link', { name: /: Build$/ }).first().click()
  const log = async (days: string, note: string) => {
    await page.locator('summary', { hasText: 'Log time' }).click()
    await page.getByLabel('Days worked').fill(days)
    await page.getByLabel('Note', { exact: true }).fill(note)
    await page.getByRole('button', { name: 'Log time' }).click()
    await expect(page.getByText(/logged\.$/)).toBeVisible()
  }
  await log('1', 'e2e full day')
  await page.reload()
  await log('0.5', 'e2e half day')
  await page.goto('/my-work')
  await expect(page.locator('.card', { hasText: 'My time' }).locator('.row', { hasText: 'Management Reporting' }).getByText('Waiting', { exact: true })).toHaveCount(2)

  // the PM returns the half day with a note and approves the rest
  await signIn(page, 'rahul@example.com')
  await page.goto('/timesheets')
  const sheet = page.locator('.card', { hasText: 'e2e full day' })
  await sheet.getByLabel("Tick all of Sahil's entries").uncheck()
  await sheet.locator('label.row', { hasText: 'e2e half day' }).getByRole('checkbox').check()
  await sheet.getByRole('button', { name: 'Return ticked…' }).click()
  await sheet.getByLabel('What should change').fill('Half days go on the review task')
  await sheet.getByRole('button', { name: 'Return with this note' }).click()
  await expect(page.locator('.card', { hasText: 'Returned' }).getByText(/Half days go on the review task/)).toBeVisible()
  await shot(page, '39-timesheets')
  await page.locator('.card', { hasText: 'e2e full day' }).getByRole('button', { name: 'Approve ticked' }).click()
  await expect(page.locator('.card', { hasText: 'Recently approved' }).getByText(/Management Reporting/).first()).toBeVisible()

  // the consultant sees why the half day came back
  await signIn(page, 'sahil@example.com')
  await page.goto('/my-work')
  const mine = page.locator('.card', { hasText: 'My time' })
  await expect(mine.getByText('Half days go on the review task')).toBeVisible()
  await expect(mine.locator('.row', { hasText: 'Management Reporting' }).getByText('Approved', { exact: true })).toBeVisible()
  await shot(page, '40-my-time')

  // finance names Sahil on the day rate; the statement fills from the approved day
  await signIn(page, 'finance@example.com')
  await page.goto('/customers')
  await page.getByRole('link', { name: /Nesma Group/ }).click()
  await page.getByRole('link', { name: 'Management Reporting' }).first().click()
  await page.getByRole('link', { name: 'Billing' }).click()
  await page.getByRole('button', { name: 'Start the rate card' }).click()
  const add = page.locator('form', { has: page.getByRole('button', { name: 'Add line' }) })
  await add.getByLabel('Role, delivery or unit').fill('Engineer')
  await add.getByLabel('Rate', { exact: true }).fill('100')
  await add.getByRole('button', { name: 'Add line' }).click()
  await expect(page.getByText('1 line on this rate card')).toBeVisible()
  await page.getByText('✓ Approve the rates for the customer').click()
  await page.getByRole('button', { name: 'Approve the rates for the customer' }).click()
  await expect(page.getByRole('heading', { name: /Approved rates v1/ })).toBeVisible()
  const people = page.locator('details', { hasText: 'Choose people' })
  await people.locator('summary').click()
  await people.getByLabel('Sahil').check()
  await people.getByRole('button', { name: 'Save people' }).click()
  await expect(page.getByText('Their approved days fill this line')).toBeVisible()
  const unbilled = page.locator('.card', { hasText: 'Unbilled work' })
  await expect(unbilled.getByText('Sahil')).toBeVisible()
  await expect(unbilled.getByText('Engineer')).toBeVisible()
  await shot(page, '41-unbilled-work')

  await page.getByRole('button', { name: 'New statement' }).click()
  await page.waitForURL(/\/billing\/[0-9a-f-]{36}$/)
  await expect(page.getByLabel('Quantity for Engineer')).toHaveValue('1')
  await expect(page.getByLabel('Note for Engineer')).toHaveValue('From approved timesheets: Sahil 1 day')
  await shot(page, '42-statement-from-timesheets')
  await page.getByText('✓ Approve the statement for the customer').click()
  await page.getByRole('button', { name: 'Approve the statement for the customer' }).click()
  await expect(page.getByRole('heading', { name: /Statement · .* Approved/ })).toBeVisible()
  await expect(page.locator('.card', { hasText: 'Days logged in this period' }).locator('.row', { hasText: 'Sahil' })).toContainText('1.5 1.5 1 0 1'.replace(/ /g, ''))
  await page.getByRole('link', { name: '← Billing' }).click()
  await expect(page.locator('.card', { hasText: 'Unbilled work' })).toHaveCount(0)

  // billed days are locked for good
  await signIn(page, 'sahil@example.com')
  await page.goto('/my-work')
  await expect(page.locator('.card', { hasText: 'My time' }).locator('.row', { hasText: 'Management Reporting' }).getByText('Billed', { exact: true })).toBeVisible()
})

test('admin previews and runs the HubSpot + Zoho import', async ({ page }) => {
  test.setTimeout(180_000)
  await signIn(page, 'admin@example.com')
  await page.goto('/admin')
  await page.getByRole('link', { name: 'Import from HubSpot & Zoho' }).click()
  await expect(page.getByRole('heading', { name: 'Import from HubSpot & Zoho' })).toBeVisible()
  // without live credentials (CI) the page explains what is missing and does nothing else
  if (await page.getByText('HubSpot is not connected').isVisible()) return
  await expect(page.getByText(/won HubSpot deals/)).toBeVisible()
  await shot(page, '24-import-preview')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByText(/Import finished/)).toBeVisible({ timeout: 120_000 })
  await shot(page, '25-import-done')
  await page.goto('/customers')
  await shot(page, '26-customers-after-import')
})

test('the sidebar shows names, collapses to icons and remembers the choice', async ({ page }) => {
  await signIn(page, 'abhijit@example.com')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link', { name: 'Customers' })).toContainText('Customers')
  await shot(page, '27-nav-expanded')
  await nav.getByRole('button', { name: 'Collapse navigation' }).click()
  await expect(nav.getByRole('button', { name: 'Expand navigation' })).toBeVisible()
  await page.reload()
  await expect(nav.getByRole('button', { name: 'Expand navigation' })).toBeVisible()   // kept across reloads
  await nav.getByRole('link', { name: 'Customers' }).hover()
  await expect(nav.getByRole('tooltip', { name: 'Customers' })).toBeVisible()
  await shot(page, '28-nav-collapsed')
  await nav.getByRole('button', { name: 'Expand navigation' }).click()
})

test('PM gives a task to a consultant, who finds it in My Work', async ({ page }) => {
  await signIn(page, 'rahul@example.com')
  await page.goto('/projects')
  await page.getByRole('link', { name: 'Infor LN Integration' }).click()
  await page.getByRole('link', { name: 'Testing: Plan' }).click()
  await page.getByLabel('Task owner').selectOption({ label: 'Sahil' })
  await page.waitForLoadState('networkidle')
  await page.reload()
  await expect(page.getByText('Sahil · Seven Billion')).toBeVisible()
  await shot(page, '33-task-owner')
  await signIn(page, 'sahil@example.com')
  await page.goto('/my-work')
  await expect(page.getByText('Testing: Plan')).toBeVisible()
})

test('PM logs a verbal request for a customer and puts it on the plan; the customer sees both', async ({ page }) => {
  await signIn(page, 'rahul@example.com')
  await page.goto('/requests')
  await page.getByRole('link', { name: '+ Log a request' }).click()
  await page.waitForURL(/\/requests\/new/)
  await page.getByRole('link', { name: 'Nesma Group', exact: true }).click()
  await page.waitForURL(/customer=/)
  const omarOption = page.getByLabel('On behalf of').locator('option', { hasText: /^Omar/ })
  await page.getByLabel('On behalf of').selectOption((await omarOption.getAttribute('value'))!)
  await page.getByLabel('Title').fill('Weekly stock email')
  await page.getByLabel('What do you need?').fill('Asked on the Monday call: stock cover by email every Monday.')
  await page.getByLabel('Project').selectOption({ label: 'Power BI Implementation' })
  await page.getByRole('button', { name: 'Log the request' }).click()
  await expect(page.getByText('Logged by Rahul on their behalf')).toBeVisible()
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Turn into a task' }) })
  await card.getByLabel('Task owner').selectOption({ label: 'Sahil' })
  await card.getByLabel('Estimate in days').fill('2')
  await card.getByRole('button', { name: 'Add to the plan' }).click()
  await expect(page.getByText('Added to the plan. The customer can see it.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'On the plan' })).toBeVisible()
  await shot(page, '34-request-to-task')

  await signIn(page, 'omar@nesma.example.com')
  await page.goto('/portal/requests')
  await page.getByRole('link', { name: /Weekly stock email/ }).first().click()
  await expect(page.getByText('Logged by Rahul on their behalf')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'On the plan' })).toBeVisible()
  await shot(page, '35-portal-logged-request')
})

test('the installed app: manifest, worker and offline page load without signing in', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  expect(await manifest.json()).toMatchObject({ display: 'standalone', start_url: '/' })
  const sw = await request.get('/sw.js')
  expect(sw.ok()).toBe(true)
  expect(sw.headers()['cache-control']).toContain('no-cache')
  expect((await request.get('/offline.html')).ok()).toBe(true)
  expect((await request.get('/brand/icon-192.png')).ok()).toBe(true)
})

test('sign in with the code from the email, and the session lasts 30 days', async ({ page }) => {
  const email = 'omar@nesma.example.com'
  await page.context().clearCookies()
  await page.goto('/login')
  const started = Date.now()
  await page.getByLabel('Work email').fill(email)
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByLabel('Or enter the code from the email')).toBeVisible()
  await shot(page, '29-login-code')
  // a wrong code keeps the email and says so
  await page.getByLabel('Or enter the code from the email').fill('000000')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('That code is wrong or has expired')).toBeVisible()   // not getByRole('alert'): Next adds a route announcer
  const code = await latestCode(email, started)
  await page.getByLabel('Or enter the code from the email').fill(code)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/portal$/)
  const auth = (await page.context().cookies()).filter((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))
  expect(auth.length).toBeGreaterThan(0)
  for (const c of auth) expect(c.expires * 1000 - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('the menu opens as a drawer and pages fit the screen', async ({ page }) => {
    await signIn(page, 'abhijit@example.com')
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
    await page.getByRole('button', { name: 'Open menu' }).click()
    const menu = page.getByRole('dialog', { name: 'Menu' })
    await expect(menu.getByRole('link', { name: 'Projects' })).toBeVisible()
    expect((await menu.locator('> div').last().boundingBox())!.height).toBeGreaterThan(800)   // the whole screen, not clipped to the top bar
    await shot(page, '30-phone-menu')
    await menu.getByRole('link', { name: 'Projects' }).click()
    await expect(page).toHaveURL(/\/projects$/)
    await expect(menu).toBeHidden()
    await page.goto('/projects')
    const project = (await page.locator('main a[href^="/projects/"]:not([href^="/projects/new"])').first().getAttribute('href'))!
    await page.goto('/customers')
    const customer = (await page.locator('main a[href^="/customers/"]').first().getAttribute('href'))!
    for (const path of ['/home', '/my-work', '/requests', '/customers', customer, '/projects', project, `${project}/requests`, `${project}/documents`, `${project}/updates`, `${project}/billing`,
      `${project}/meetings`, `${project}/decisions`, '/feedback', '/finance', '/admin']) {
      await page.goto(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - 390)
      if (overflow > 1) console.log(await page.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > 392 && !e.closest('.overflow-x-auto')).slice(0, 6).map((e) => `${e.tagName}.${e.className} ${Math.round(e.getBoundingClientRect().right)}`).join('\n')))
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1)
      await shot(page, `31-phone${path.replace(/\//g, '-').slice(0, 60)}`)
    }
  })

  test('the customer portal fits the screen', async ({ page }) => {
    await signIn(page, 'omar@nesma.example.com')
    for (const path of ['/portal', '/portal/requests', '/portal/requests/new', '/portal/meetings', '/portal/decisions', '/portal/documents', '/portal/feedback', '/portal/billing']) {
      await page.goto(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - 390)
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1)
      await shot(page, `32-phone${path.replace(/\//g, '-')}`)
    }
  })
})

test.describe('on a phone, billing', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  test('several deliveries and several people on one rate card; the model stays as chosen', async ({ page }) => {
    await signIn(page, 'finance@example.com')
    await page.goto('/customers')
    await page.getByRole('link', { name: /Nesma Group/ }).click()
    await page.getByRole('link', { name: 'Power BI Implementation' }).first().click()
    await page.getByRole('link', { name: 'Billing' }).click()
    await page.getByRole('button', { name: 'Start the rate card' }).click()
    // billed in US dollars
    await page.getByLabel('Currency').selectOption('USD')
    await page.getByRole('button', { name: 'Save details' }).click()
    await expect(page.getByText('Saved.')).toBeVisible()
    const add = page.locator('form', { has: page.getByRole('button', { name: 'Add line' }) })
    await expect(add.getByText('Rate (USD)')).toBeVisible()
    const addLine = async (label: string, rate: string, n: number) => {
      await add.getByLabel('Role, delivery or unit').fill(label)
      await add.getByLabel('Rate', { exact: true }).fill(rate)
      await add.getByRole('button', { name: 'Add line' }).click()
      await expect(page.getByText(`${n} ${n === 1 ? 'line' : 'lines'} on this rate card`)).toBeVisible()
    }
    // three deliveries, choosing the model once
    await add.getByLabel('Billing model').selectOption('delivery')
    await addLine('Sales dashboard', '500', 1)
    await expect(add.getByLabel('Billing model')).toHaveValue('delivery')
    await expect(add.getByLabel('Unit', { exact: true })).toHaveValue('delivery')
    await addLine('Inventory dashboard', '400', 2)
    await addLine('Finance dashboard', '450', 3)
    // two people on day rates
    await add.getByLabel('Billing model').selectOption('day_rate')
    await addLine('Data engineer', '90', 4)
    await addLine('BI developer', '80', 5)
    const list = page.locator('details', { has: page.locator('input[name="line_id"]') }).locator('summary')
    await expect(list).toHaveCount(5)
    await expect(list.filter({ hasText: 'Per delivery' })).toHaveCount(3)
    await expect(list.filter({ hasText: 'Sales dashboard' })).toContainText('$500.00')
    await expect(list.filter({ hasText: 'Day rate per resource' })).toHaveCount(2)
    await shot(page, '37-phone-rate-card-lines')
    // a line opens for editing
    await list.filter({ hasText: 'Inventory dashboard' }).click()
    await expect(page.locator('details[open] input[name="label"]')).toHaveValue('Inventory dashboard')
    await list.filter({ hasText: 'Inventory dashboard' }).click()

    // a line typed but not added stops the send, so it is never lost
    await add.getByLabel('Role, delivery or unit').fill('Forgotten line')
    let warning = ''
    page.once('dialog', (d) => { warning = d.message(); void d.accept() })
    await page.getByRole('button', { name: 'Send to customer for approval' }).click()
    await expect.poll(() => warning).toContain('has not been added yet')
    await expect(page.getByText('Rate card v1')).toBeVisible()
    await add.getByLabel('Role, delivery or unit').fill('')

    // agreed in the contract: approved here, the customer is told
    await page.getByText('✓ Approve the rates for the customer').click()
    await page.getByLabel('How the customer agreed').fill('Signed SOW')
    await page.getByRole('button', { name: 'Approve the rates for the customer' }).click()
    await expect(page.getByRole('heading', { name: /Approved rates v1/ })).toBeVisible()   // the draft is replaced by the approved rates
    await expect(page.getByText('Rate card v1')).toHaveCount(0)
    await shot(page, '38-phone-rates-approved-for-customer')
  })
})
