'use client'

import { useActionState } from 'react'
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
    </form>
  )
}
