'use client'

import { useActionState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sendMagicLink, type LoginState } from './actions'

/** After the email is sent: open the link, or type the code from the same email (needed in the installed app). */
function CodeForm({ email, next, error }: { email: string; next: string; error?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div role="status" className="rounded-md border border-line bg-head p-3 text-[13px] leading-relaxed">
        <b>Check your inbox.</b> If <span className="font-medium">{email}</span> has access, an email with a sign-in link and a code is on its way.
        <span className="mt-1.5 block text-xs text-muted">
          Nothing after a few minutes? Check Junk. If you have not been invited yet, no email is sent: Helm is invite-only, so ask
          your Seven Billion contact (or your admin, if you work at Seven Billion) to invite you.
        </span>
      </div>
      <form action="/auth/code" method="post" className="flex flex-col gap-2.5">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <label htmlFor="code" className="label">Or enter the code from the email</label>
        <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,12}" maxLength={12} autoFocus
          placeholder="123456" className="input h-11 text-center font-mono text-lg tracking-[.3em]" />
        {error ? <p role="alert" className="m-0 text-xs text-crit-ink">That code is wrong or has expired. Check the latest email, or send a new one.</p> : null}
        <button type="submit" className="btn btn-primary h-10 text-sm">Sign in</button>
        <a href={`/login?next=${encodeURIComponent(next)}`} className="text-center text-xs text-muted">Use a different email or send a new code</a>
      </form>
    </div>
  )
}

export function LoginForm({ next, codeFor, codeError }: { next: string; codeFor?: string; codeError?: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: 'idle' })
  if (codeFor) return <CodeForm email={codeFor} next={next} error={codeError} />
  if (state.status === 'sent') return <CodeForm email={state.email!} next={next} />
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="label">Work email</label>
      <input id="email" name="email" type="email" required autoComplete="email" autoFocus placeholder="you@company.com" className="input h-10 text-sm" />
      {state.status === 'error' ? <p role="alert" className="m-0 text-xs text-crit-ink">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="btn btn-primary h-10 text-sm">{pending ? 'Sending…' : 'Email me a sign-in link'}</button>
      <p className="m-0 text-xs leading-relaxed text-muted">
        No password needed. <b className="font-medium text-ink">Helm is invite-only:</b> you can sign in once someone at Seven Billion has
        invited you. Accounts can&apos;t be created here, so if you don&apos;t have one yet, ask your Seven Billion contact.
      </p>
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
