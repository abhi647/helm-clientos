import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { LoginForm } from './login-form'
import { BrandLockup } from '@/components/brand'

export const metadata: Metadata = { title: 'Sign in' }

const ERRORS: Record<string, string> = {
  'no-access': 'You are signed in, but your account has not been given access yet. Contact your Seven Billion team.',
  'link-expired': 'That sign-in link has expired or was already used. Request a new one below.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; email?: string }> }) {
  const { next, error, email } = await searchParams
  const badCode = error === 'bad-code' && !!email
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex items-center justify-center bg-white px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <BrandLockup size={34} by />
          </div>
          <h1 className="m-0 mb-1 text-xl font-semibold">Sign in</h1>
          <p className="mt-0 mb-5 text-[13px] text-muted">Projects, requests, approvals and updates, in one place.</p>
          {error && ERRORS[error] && !badCode ? <p role="alert" className="mb-4 rounded-md bg-warn-bg p-2.5 text-xs text-warn-ink">{ERRORS[error]}</p> : null}
          <LoginForm next={next ?? '/'} codeFor={badCode ? email : undefined} codeError={badCode} />
          <p className="mt-8 mb-0 text-xs text-muted"><Link href="/privacy" className="text-muted">Privacy</Link> · <Link href="/terms" className="text-muted">Terms of use</Link></p>
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
