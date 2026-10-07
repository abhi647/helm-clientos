// One-time setup of a fresh Supabase project: creates the organisation and invites the first admin.
// Everything after this (colleagues, customers, roles) is done in the app under Admin.
//
// Usage (from client-os/, with the PRODUCTION values in .env.production.local, never committed):
//   node --env-file=.env.production.local scripts/bootstrap.mjs --email you@sevenbillion.co --name "Your Name"
//   [--org "Seven Billion"] [--role admin|ceo]
//
// Safe to run twice: it reuses the organisation and updates the existing user's access instead of duplicating.
import { createClient } from '@supabase/supabase-js'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    email: { type: 'string' }, name: { type: 'string' },
    org: { type: 'string', default: 'Seven Billion' }, role: { type: 'string', default: 'admin' },
  },
})
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
const site = process.env.NEXT_PUBLIC_SITE_URL
if (!url || !key || !site) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and NEXT_PUBLIC_SITE_URL (see .env.example).')
if (!values.email || !values.name) throw new Error('Usage: --email you@company.com --name "Your Name"')
if (!['admin', 'ceo'].includes(values.role)) throw new Error('--role must be admin or ceo')
const email = values.email.trim().toLowerCase()

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: class NoRealtime {} },   // never used here; lets the script run on Node 20, which has no built-in WebSocket
})
const ok = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data
}

// 1. the organisation (one per deployment)
let org = ok(await db.from('orgs').select('id, name').order('created_at').limit(1), 'read orgs')[0]
if (!org) org = ok(await db.from('orgs').insert({ name: values.org }).select('id, name').single(), 'create org')
console.log(`Organisation: ${org.name}`)

// 2. the first admin: invite (or find), then grant access through app_metadata, which only the server can write
let user = null
for (let page = 1; !user; page++) {
  const { users } = ok(await db.auth.admin.listUsers({ page, perPage: 200 }), 'list users')
  user = users.find((u) => u.email?.toLowerCase() === email) ?? null
  if (users.length < 200) break
}
if (!user) {
  user = ok(await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/auth/confirm?next=/home` }), 'invite').user
  console.log(`Invitation email sent to ${email}.`)
} else {
  console.log(`${email} already has an account; updating access.`)
}
ok(await db.auth.admin.updateUserById(user.id, {
  app_metadata: { ...(user.app_metadata ?? {}), kind: 'internal', org_id: org.id, internal_role: values.role, full_name: values.name },
}), 'grant access')

const profile = ok(await db.from('profiles').select('kind, internal_role').eq('id', user.id).maybeSingle(), 'check profile')
if (profile?.kind !== 'internal') throw new Error('The profile was not created. Check that all migrations were pushed (supabase db push).')
console.log(`Done. ${values.name} is ${values.role}. Open the email link, then set up two-step sign-in with an authenticator app.`)
