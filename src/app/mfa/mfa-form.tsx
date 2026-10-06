'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type State =
  | { step: 'loading' }
  | { step: 'enroll'; factorId: string; qr: string; secret: string }
  | { step: 'verify'; factorId: string }

/** Set up an authenticator app (first time) or enter today's code. Uses Supabase Auth TOTP factors. */
export function MfaForm({ next }: { next: string }) {
  const [state, setState] = useState<State>({ step: 'loading' })
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) return setError('Could not load your sign-in settings. Refresh the page.')
      const verified = data.totp.find((f) => f.status === 'verified')
      if (verified) return setState({ step: 'verify', factorId: verified.id })
      // clear half-finished setups, then start a fresh one
      for (const f of data.all.filter((f) => f.factor_type === 'totp' && f.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
      const { data: e, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` })
      if (enrollError || !e) return setError('Could not start the setup. Refresh the page.')
      setState({ step: 'enroll', factorId: e.id, qr: e.totp.qr_code, secret: e.totp.secret })
    })()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (state.step === 'loading') return
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code: code.replace(/\s/g, '') })
    setBusy(false)
    if (error) return setError('That code did not work. Check the time on your phone and try the newest code.')
    window.location.assign(next)
  }

  if (state.step === 'loading') return <p className="m-0 text-[13px] text-muted">{error ?? 'Loading…'}</p>
  return (
    <>
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h1 className="m-0 text-lg font-semibold">{state.step === 'enroll' ? 'Set up two-step sign-in' : 'Enter your code'}</h1>
      {state.step === 'enroll' ? (
        <>
          <p className="m-0 text-[13px] leading-relaxed text-muted">
            Seven Billion staff confirm every sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password).
            Scan the code, then enter the 6-digit number it shows.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR as an SVG data URL */}
          <img src={state.qr} alt="QR code for your authenticator app" width={180} height={180} className="self-center rounded-md border border-line bg-white p-2" />
          <div className="flex flex-col gap-1">
            <span className="label">Can&apos;t scan? Setup key</span>
            <code data-testid="totp-secret" className="rounded-md bg-head px-2 py-1.5 font-mono text-xs break-all select-all">{state.secret}</code>
          </div>
        </>
      ) : <p className="m-0 text-[13px] text-muted">Open your authenticator app and enter the 6-digit code for Seven Billion.</p>}
      <label htmlFor="mfa-code" className="label">6-digit code</label>
      <input id="mfa-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}"
        required autoFocus className="input h-10 text-center font-mono text-lg tracking-[.3em]" />
      {error ? <p role="alert" className="m-0 text-xs text-crit-ink">{error}</p> : null}
      <button type="submit" disabled={busy} className="btn btn-primary h-10 text-sm">{busy ? 'Checking…' : state.step === 'enroll' ? 'Turn on and continue' : 'Continue'}</button>
    </form>
    <form action="/auth/signout" method="post" className="mt-2 flex justify-center"><button type="submit" className="btn btn-ghost text-xs">Sign out</button></form>
    </>
  )
}
