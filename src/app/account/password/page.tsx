import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BrandLockup } from '@/components/brand'
import { createClient } from '@/lib/supabase/server'
import { PasskeyManager } from '@/components/passkeys'
import { PasswordForm } from './password-form'

export const metadata: Metadata = { title: 'Sign-in', robots: { index: false, follow: false } }

/** How you sign in: set a password (first sign-in, or after a reset code) or change it, and add or remove passkeys. */
export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ next?: string; required?: string }> }) {
  const { next, required } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8"><BrandLockup size={34} by /></div>
        <h1 className="m-0 mb-1 text-xl font-semibold">{required ? 'Choose how you sign in' : 'Password and passkeys'}</h1>
        <p className="mt-0 mb-5 text-[13px] text-muted">
          {required ? <>You signed in with a code from your email. Add a passkey, or choose a password, for <b className="font-medium text-ink">{user.email}</b> to sign in with from now on.</>
            : <>For <b className="font-medium text-ink">{user.email}</b>.</>}
        </p>
        {required ? (
          <div className="mb-5 flex flex-col gap-2">
            <PasskeyManager then={next ?? '/'} />
            <p className="m-0 text-xs text-muted">A passkey uses Face ID, Touch ID, Windows Hello or your phone: nothing to remember or type.</p>
            <div className="my-2 flex items-center gap-2 text-[11px] text-muted"><span className="h-px flex-1 bg-line" />or choose a password<span className="h-px flex-1 bg-line" /></div>
          </div>
        ) : (
          <section className="mb-6 flex flex-col gap-2" aria-labelledby="passkeys">
            <h2 id="passkeys" className="m-0 text-sm font-semibold">Passkeys</h2>
            <p className="m-0 text-xs text-muted">Sign in with Face ID, Touch ID, Windows Hello or your phone instead of typing your password. Add one on each device you use.</p>
            <PasskeyManager />
            <h2 className="m-0 mt-4 text-sm font-semibold">Change your password</h2>
          </section>
        )}
        <PasswordForm next={next ?? '/'} email={user.email ?? ''} />
        {!required ? <p className="mt-6 mb-0 text-xs"><Link href={next ?? '/'} className="text-muted">Back</Link></p> : null}
      </div>
    </main>
  )
}
