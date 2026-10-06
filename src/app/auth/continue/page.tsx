import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BrandLockup } from '@/components/brand'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } }

/**
 * Landing for email links. Mail scanners load this page but never press the button, so the link stays valid.
 * The button is a full-page post to /auth/confirm (not a server action), so the redirects that follow, such as
 * staff going to /mfa, show in the address bar.
 */
export default async function ContinuePage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; next?: string }> }) {
  const { token_hash, type, next } = await searchParams
  if (!token_hash) redirect('/login?error=link-expired')
  const invite = type === 'invite'
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <form action="/auth/confirm" method="post" className="flex w-full max-w-sm flex-col gap-2.5">
        <div className="mb-6 flex items-center gap-2.5"><BrandLockup size={34} by /></div>
        <h1 className="m-0 text-xl font-semibold">{invite ? 'Welcome to Helm' : 'Sign in to Helm'}</h1>
        <p className="mt-0 mb-3 text-[13px] text-muted">{invite ? 'Open your workspace to accept the invitation.' : 'Continue to finish signing in.'}</p>
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type ?? 'email'} />
        <input type="hidden" name="next" value={next ?? '/'} />
        <button type="submit" autoFocus className="btn btn-primary h-10 text-sm">{invite ? 'Open your workspace' : 'Continue'}</button>
      </form>
    </main>
  )
}
