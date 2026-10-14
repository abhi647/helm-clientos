import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BrandLockup } from '@/components/brand'
import { createClient } from '@/lib/supabase/server'
import { PasswordForm } from './password-form'

export const metadata: Metadata = { title: 'Your password', robots: { index: false, follow: false } }

/** Set a password (first sign-in, or after a reset code) or change it. */
export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ next?: string; required?: string }> }) {
  const { next, required } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8"><BrandLockup size={34} by /></div>
        <h1 className="m-0 mb-1 text-xl font-semibold">{required ? 'Choose your password' : 'Change your password'}</h1>
        <p className="mt-0 mb-5 text-[13px] text-muted">
          {required ? <>You signed in with a code from your email. Choose a password for <b className="font-medium text-ink">{user.email}</b> to sign in with from now on.</>
            : <>For <b className="font-medium text-ink">{user.email}</b>.</>}
        </p>
        <PasswordForm next={next ?? '/'} />
        {!required ? <p className="mt-6 mb-0 text-xs"><Link href={next ?? '/'} className="text-muted">Back</Link></p> : null}
      </div>
    </main>
  )
}
