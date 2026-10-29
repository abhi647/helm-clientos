'use client'

import { useActionState, useState } from 'react'
import { setPassword, type SetPasswordState } from '@/app/account/actions'

export function PasswordForm({ next, email }: { next: string; email: string }) {
  const [state, action, pending] = useActionState<SetPasswordState, FormData>(setPassword, { status: 'idle' })
  // kept in state: a form action clears its fields, and the code step must not make people type the password again
  const [password, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="next" value={next} />
      {/* password managers save a new password against the username next to it: without this they don't offer to */}
      <input type="email" name="username" value={email} readOnly autoComplete="username" tabIndex={-1} aria-hidden className="sr-only" />
      <label htmlFor="password" className="label">New password</label>
      <input id="password" name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" autoFocus={state.status !== 'code'}
        value={password} onChange={(e) => setPw(e.target.value)} className="input h-10 text-sm" />
      <label htmlFor="confirm" className="label">Type it again</label>
      <input id="confirm" name="confirm" type="password" required minLength={10} maxLength={72} autoComplete="new-password"
        value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input h-10 text-sm" />
      <p className="m-0 text-xs text-muted">At least 10 characters. A short sentence is easy to remember and hard to guess.</p>
      {state.status === 'code' ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-line bg-head p-2.5">
          <label htmlFor="nonce" className="label">Code from the email</label>
          <p className="m-0 text-xs text-muted">To protect your account, we emailed a 6-digit code to {email}. Enter it to save the new password.</p>
          <input id="nonce" name="nonce" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,12}" maxLength={12} autoFocus
            placeholder="123456" className="input h-10 text-center font-mono tracking-[.3em]" />
          {state.message ? <p role="alert" className="m-0 text-xs text-crit-ink">{state.message}</p> : null}
        </div>
      ) : null}
      {state.status === 'error' ? <p role="alert" className="m-0 text-xs text-crit-ink">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="btn btn-primary h-10 text-sm">{pending ? 'Saving…' : 'Save password and continue'}</button>
    </form>
  )
}
