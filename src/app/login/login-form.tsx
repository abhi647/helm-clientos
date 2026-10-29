'use client'

import { useActionState, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PasskeySignIn } from '@/components/passkeys'
import { sendMagicLink, type LoginState } from './actions'

/** After the email is sent: open the link, or type the code from the same email (needed in the installed app). */
function CodeForm({ email, next, error }: { email: string; next: string; error?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div role="status" className="rounded-md border border-line bg-head p-3 text-[13px] leading-relaxed">
        <b>Check your inbox.</b> If <span className="font-medium">{email}</span> has access, an email with a 6-digit code is on its way. Enter it below, then choose your password.
        <span className="mt-1.5 block text-xs text-muted">
          Nothing after a few minutes? Check Junk. If you have not been invited yet, no email is sent: Helm is invite-only, so ask
          your Seven Billion contact (or your admin, if you work at Seven Billion) to invite you.
        </span>
      </div>
      <form action="/auth/code" method="post" className="flex flex-col gap-2.5">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <label htmlFor="code" className="label">Code from the email</label>
        <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,12}" maxLength={12} autoFocus
          placeholder="123456" className="input h-11 text-center font-mono text-lg tracking-[.3em]" />
        {error ? <p role="alert" className="m-0 text-xs text-crit-ink">That code is wrong or has expired. Check the latest email, or send a new one.</p> : null}
        <button type="submit" className="btn btn-primary h-10 text-sm">Continue</button>
        <a href={`/login?next=${encodeURIComponent(next)}`} className="text-center text-xs text-muted">Back to sign in</a>
      </form>
    </div>
  )
}

const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === 'true'
const MICROSOFT = process.env.NEXT_PUBLIC_MICROSOFT_SIGNIN === 'true'

/** Google or Microsoft: one click, no email to wait for. Invite-only still holds: sign-ups are off in Supabase. */
function signInWith(provider: 'google' | 'azure', next: string) {
  const redirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`
  return createClient().auth.signInWithOAuth(provider === 'google'
    ? { provider, options: { redirectTo, queryParams: { prompt: 'select_account' } } }
    : { provider, options: { redirectTo, scopes: 'email', queryParams: { prompt: 'select_account' } } })
}

export function LoginForm({ next, codeFor, codeError }: { next: string; codeFor?: string; codeError?: boolean }) {
  const [reset, setReset] = useState(false)
  const [sent, sendCode, sending] = useActionState<LoginState, FormData>(sendMagicLink, { status: 'idle' })
  const [signingIn, setSigningIn] = useState(false)
  if (codeFor) return <CodeForm email={codeFor} next={next} error={codeError} />
  if (sent.status === 'sent') return <CodeForm email={sent.email!} next={next} />
  const sso = GOOGLE || MICROSOFT
  if (reset) {
    return (
      <form action={sendCode} className="flex flex-col gap-2.5">
        <input type="hidden" name="next" value={next} />
        <p className="m-0 text-[13px] leading-relaxed">First time here, or forgot your password? We&apos;ll email you a 6-digit code, then you choose a password.</p>
        <label htmlFor="reset-email" className="label">Work email</label>
        <input id="reset-email" name="email" type="email" required autoComplete="email" autoFocus placeholder="you@company.com" className="input h-10 text-sm" />
        {sent.status === 'error' ? <p role="alert" className="m-0 text-xs text-crit-ink">{sent.message}</p> : null}
        <button type="submit" disabled={sending} className="btn btn-primary h-10 text-sm">{sending ? 'Sending…' : 'Email me a code'}</button>
        <button type="button" onClick={() => setReset(false)} className="text-center text-xs text-muted">Back to sign in</button>
      </form>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {GOOGLE ? (
        <button type="button" className="btn h-10 text-sm" onClick={() => signInWith('google', next)}>
          <svg aria-hidden viewBox="0 0 24 24" className="size-4"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>
          Continue with Google
        </button>
      ) : null}
      {MICROSOFT ? (
        <button type="button" className="btn h-10 text-sm" onClick={() => signInWith('azure', next)}>
          <svg aria-hidden viewBox="0 0 24 24" className="size-4"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>
          Continue with Microsoft
        </button>
      ) : null}
      <PasskeySignIn next={next} />
      <div className="my-1 flex items-center gap-2 text-[11px] text-muted"><span className="h-px flex-1 bg-line" />or with your email and password<span className="h-px flex-1 bg-line" /></div>
      {/* a full-page post (src/app/auth/password), so browsers recognise the sign-in and offer to save the password */}
      <form action="/auth/password" method="post" onSubmit={() => setSigningIn(true)} className="flex flex-col gap-2.5">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="email" className="label">Work email</label>
        <input id="email" name="email" type="email" required autoComplete="username webauthn" autoFocus={!sso} placeholder="you@company.com" className="input h-10 text-sm" />
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input h-10 text-sm" />
        <button type="submit" disabled={signingIn} className="btn btn-primary h-10 text-sm">{signingIn ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <button type="button" onClick={() => setReset(true)} className="text-center text-xs font-medium text-link">Set or reset your password</button>
      <p className="m-0 text-xs leading-relaxed text-muted">
        <b className="font-medium text-ink">Helm is invite-only.</b> First time here? Use <i>Set or reset your password</i> with the email you were
        invited with{sso ? ', or the Google or Microsoft account for that address' : ''}. No access yet? Ask your Seven Billion contact.
      </p>
    </div>
  )
}
