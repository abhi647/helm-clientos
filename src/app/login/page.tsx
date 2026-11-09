import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { LoginForm } from './login-form'
import { cookies } from 'next/headers'
import { BrandLockup } from '@/components/brand'
import { LAST_SIGN_IN_COOKIE, parseLastSignIn } from '@/lib/last-sign-in'

export const metadata: Metadata = { title: 'Sign in' }

const ERRORS: Record<string, string> = {
  'no-access': 'You are signed in, but your account has not been given access yet. Contact your Seven Billion team.',
  'link-expired': 'That sign-in link has expired or was already used. Request a new one below.',
  'wrong-password': 'Wrong email or password. First time here, or forgot it? Use “Set or reset your password” below, or sign in with a passkey.',
  'too-many': 'Too many attempts. Please wait a few minutes and try again.',
  'not-invited': 'That Google or Microsoft account is not the email you were invited with, so it has no access to Helm. Sign in with your invited email (or ask for an invite), then connect this account from Your profile to use it next time.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; email?: string }> }) {
  const { next, error, email } = await searchParams
  const badCode = error === 'bad-code' && !!email
  const last = parseLastSignIn((await cookies()).get(LAST_SIGN_IN_COOKIE)?.value)
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex items-center justify-center bg-white px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <BrandLockup size={34} by />
          </div>
          <h1 className="m-0 mb-1 text-xl font-semibold">Sign in</h1>
          <p className="mt-0 mb-5 text-[13px] text-muted-foreground">Projects, requests, approvals and updates, in one place.</p>
          {error && ERRORS[error] && !badCode ? <p role="alert" className="mb-4 rounded-md bg-warn-bg p-2.5 text-xs text-warn-ink">{ERRORS[error]}</p> : null}
          <LoginForm next={next ?? '/'} codeFor={badCode ? email : undefined} codeError={badCode} last={last} />
          <p className="mt-8 mb-0 text-xs text-muted-foreground"><Link href="/privacy" className="text-muted-foreground">Privacy</Link> · <Link href="/terms" className="text-muted-foreground">Terms of use</Link></p>
        </div>
      </div>
      <div className="relative hidden lg:block">
        <Image src="/greeting/morning.jpg" alt="" fill priority sizes="55vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,24,28,0)_40%,rgba(8,24,28,.7)_100%)]" />
        <p className="absolute bottom-8 left-8 m-0 max-w-md text-lg font-medium text-white">Always know what is happening, and what Seven Billion needs from you.</p>
        <span className="absolute right-2 bottom-1 text-[10px] text-white/75">Photo: Unsplash</span>
      </div>
    </main>
  )
}
