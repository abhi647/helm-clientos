import type { Metadata } from 'next'
import Link from 'next/link'
import { IconBrandGoogle as Google, IconBrandWindows as Microsoft, IconFingerprint as Fingerprint, IconMail as Mail } from '@tabler/icons-react'
import { saveProfile } from '@/app/account/profile-actions'
import { AvatarEditor } from '@/app/account/avatar-editor'
import { BrandLockup } from '@/components/brand'
import { ActionForm } from '@/components/forms'
import { btn, Card, Chip } from '@/components/ui'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { avatarUrl } from '@/lib/avatar'
import { requireProfile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Your profile', robots: { index: false, follow: false } }

const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === 'true'
const MICROSOFT = process.env.NEXT_PUBLIC_MICROSOFT_SIGNIN === 'true'

/** Your photo and details, and the ways you can sign in. Everyone (team and customers) has one. */
export default async function Profile() {
  const me = await requireProfile()
  const supabase = await createClient()
  const [{ data: { user } }, { data: passkeys }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.passkey.list(),
  ])
  const providers = new Set((user?.identities ?? []).map((i) => i.provider))
  const home = me.kind === 'internal' ? '/home' : '/portal'
  const zones = Intl.supportedValuesOf('timeZone')
  const methods = [
    { icon: <Mail />, name: 'Email and password', on: !!user?.app_metadata?.password_set_at || providers.has('email'), hint: 'Or a 6-digit code by email' },
    { icon: <Fingerprint />, name: 'Passkey', on: !!passkeys?.length, hint: passkeys?.length ? `${passkeys.length} on your devices` : 'Face ID, Touch ID, Windows Hello or your phone' },
    ...(GOOGLE ? [{ icon: <Google />, name: 'Google (Gmail)', on: providers.has('google'), hint: `Use “Continue with Google” with ${me.email}` }] : []),
    ...(MICROSOFT ? [{ icon: <Microsoft />, name: 'Microsoft (Outlook)', on: providers.has('azure'), hint: `Use “Continue with Microsoft” with ${me.email}` }] : []),
  ]
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <BrandLockup size={30} by />
          <Link href={home} className={btn('outline')}>Back to Helm</Link>
        </div>
        <div>
          <h1 className="m-0 text-xl font-semibold">Your profile</h1>
          <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">How you appear in Helm{me.kind === 'internal' ? ' to the team and to customers on your work' : ' to the Seven Billion team'}.</p>
        </div>

        <Card title="Photo">
          <AvatarEditor userId={me.id} name={me.full_name} photo={avatarUrl(me.avatar_path)} color={me.avatar_color} />
        </Card>

        <Card title="Your details" description={me.kind === 'internal' ? 'Your name and job title show with your photo; the rest is for the Seven Billion team.' : 'Shown to the Seven Billion team.'}>
          <ActionForm action={saveProfile} submit="Save details" resetOnSuccess={false}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1"><span className="label">Full name</span><Input name="full_name" required maxLength={80} defaultValue={me.full_name} autoComplete="name" /></label>
              <label className="flex flex-col gap-1"><span className="label">Job title</span><Input name="job_title" maxLength={80} defaultValue={me.job_title ?? ''} placeholder="e.g. Senior BI consultant" autoComplete="organization-title" /></label>
              <label className="flex flex-col gap-1"><span className="label">Phone</span><Input name="phone" type="tel" maxLength={30} defaultValue={me.phone ?? ''} placeholder="+91 98765 43210" autoComplete="tel" /></label>
              <label className="flex flex-col gap-1"><span className="label">Location</span><Input name="location" maxLength={80} defaultValue={me.location ?? ''} placeholder="e.g. Pune, India" /></label>
              <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">Time zone</span>
                <NativeSelect size="sm" name="timezone" defaultValue={me.timezone ?? ''} containerClassName="w-full">
                  <option value="">Not set</option>
                  {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
                </NativeSelect></label>
              <label className="flex flex-col gap-1 sm:col-span-2"><span className="label">About you</span>
                <Textarea name="bio" rows={3} maxLength={500} defaultValue={me.bio ?? ''} placeholder="A line or two: what you work on, what to ask you about." /></label>
            </div>
            <p className="m-0 text-xs text-muted-foreground">Email: <b className="font-medium text-foreground">{me.email}</b>. To change it, ask an admin.</p>
          </ActionForm>
        </Card>

        <Card flush title="How you sign in" extra={<Link href={`/account/password?next=${encodeURIComponent('/account/profile')}`} className="text-xs font-medium">Password and passkeys →</Link>}>
          <ul className="m-0 list-none p-0">
            {methods.map((m) => (
              <li key={m.name} className="flex items-center gap-3 border-t border-border/60 px-3.5 py-2.5 first:border-t-0">
                <span aria-hidden className="grid size-8 flex-none place-items-center rounded-lg bg-muted text-muted-foreground [&>svg]:size-4">{m.icon}</span>
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{m.name}</span><span className="block truncate text-xs text-muted-foreground">{m.hint}</span></span>
                {m.on ? <Chip tone="good" dot>On</Chip> : <Chip tone="neutral">Not set up</Chip>}
              </li>
            ))}
          </ul>
          {GOOGLE || MICROSOFT ? (
            <p className="m-0 border-t border-border/60 px-3.5 py-2 text-xs text-muted-foreground">
              Google and Microsoft sign-in connect on their own the first time you use them with the same email address as your Helm account.
            </p>
          ) : null}
        </Card>
      </div>
    </main>
  )
}
