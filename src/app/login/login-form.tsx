'use client'

import { useActionState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendMagicLink, type LoginState } from './actions'

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: 'idle' })
  if (state.status === 'sent') {
    return (
      <div role="status" className="rounded-md border border-line bg-head p-3 text-[13px] leading-relaxed">
        <b>Check your inbox.</b> If <span className="font-medium">{state.email}</span> has access, a sign-in link is on its way. It works once and expires in an hour.
      </div>
    )
  }
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="label">Work email</label>
      <input id="email" name="email" type="email" required autoComplete="email" autoFocus placeholder="you@company.com" className="input h-10 text-sm" />
      {state.status === 'error' ? <p role="alert" className="m-0 text-xs text-crit-ink">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="btn btn-primary h-10 text-sm">{pending ? 'Sending…' : 'Email me a sign-in link'}</button>
      <p className="m-0 text-xs text-muted">No password needed. Access is by invitation from Seven Billion.</p>
      {process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === 'true' ? (
        <>
          <div className="my-1 flex items-center gap-2 text-[11px] text-muted"><span className="h-px flex-1 bg-line" />Seven Billion team<span className="h-px flex-1 bg-line" /></div>
          <button type="button" className="btn h-10 text-sm" onClick={() => createClient().auth.signInWithOAuth({
            provider: 'google', options: { redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`, queryParams: { prompt: 'select_account' } },
          })}>
            <svg aria-hidden viewBox="0 0 24 24" className="size-4"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>
            Continue with Google
          </button>
        </>
      ) : null}
    </form>
  )
}
