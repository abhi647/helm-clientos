// The core loops from the PRD, driven through the real UI with real magic-link sign-in (emails caught by Mailpit).
// Run: supabase start && npm run seed && npm run build && npm start, then npm run test:e2e
import { execSync } from 'node:child_process'
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
  await page.getByLabel('Effort hours').fill('48')
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
