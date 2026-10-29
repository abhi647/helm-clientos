'use client'

import { useActionState } from 'react'
import { setPassword, type SetPasswordState } from '@/app/account/actions'

export function PasswordForm({ next, email }: { next: string; email: string }) {
  const [state, action, pending] = useActionState<SetPasswordState, FormData>(setPassword, { status: 'idle' })
  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="next" value={next} />
      {/* password managers save a new password against the username next to it: without this they don't offer to */}
      <input type="email" name="username" value={email} readOnly autoComplete="username" tabIndex={-1} aria-hidden className="sr-only" />
      <label htmlFor="password" className="label">New password</label>
      <input id="password" name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" autoFocus className="input h-10 text-sm" />
      <label htmlFor="confirm" className="label">Type it again</label>
      <input id="confirm" name="confirm" type="password" required minLength={10} maxLength={72} autoComplete="new-password" className="input h-10 text-sm" />
      <p className="m-0 text-xs text-muted">At least 10 characters. A short sentence is easy to remember and hard to guess.</p>
      {state.status === 'error' ? <p role="alert" className="m-0 text-xs text-crit-ink">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="btn btn-primary h-10 text-sm">{pending ? 'Saving…' : 'Save password and continue'}</button>
    </form>
  )
}
