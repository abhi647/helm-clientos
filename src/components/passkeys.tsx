'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { KeyRound } from 'lucide-react'
import { markSignInSet } from '@/app/account/actions'
import { createClient } from '@/lib/supabase/client'

/**
 * Passkeys (Face ID, Touch ID, Windows Hello, a phone or a security key) through Supabase Auth.
 * Sign-in sets the session cookies in the browser, then loads the next page in full so the server sees them.
 */

const supported = () => typeof window !== 'undefined' && 'PublicKeyCredential' in window
const noop = () => () => {}
/** Passkey support, false while rendering on the server (so the first render matches). */
const usePasskeySupport = () => useSyncExternalStore(noop, supported, () => false)
const go = (next: string) => window.location.assign(next.startsWith('/') && !next.startsWith('//') ? next : '/')
// the person cancelled or closed the browser's sheet: not an error worth showing
const cancelled = (e: { code?: string; name?: string; message?: string } | null) =>
  !!e && (/abort|cancel|NotAllowed/i.test(`${e.code ?? ''} ${e.name ?? ''}`) || /not allowed|timed out|cancel/i.test(e.message ?? ''))

/** "Sign in with a passkey", plus passkey suggestions in the email field's autofill where the browser supports it. */
export function PasskeySignIn({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const available = usePasskeySupport()
  const autofill = useRef<AbortController | null>(null)

  const signIn = useCallback(async (conditional: boolean) => {
    if (!conditional) { autofill.current?.abort(); setBusy(true); setError(null) }
    const signal = conditional ? (autofill.current = new AbortController()).signal : undefined
    const { data, error } = await createClient().auth.signInWithPasskey({ options: { ...(conditional ? { mediation: 'conditional' as const, signal } : {}) } })
    if (data?.session) return go(next)
    setBusy(false)
    if (error && !cancelled(error as never) && !conditional) {
      setError(/not found|unknown|no passkey|credential/i.test(error.message)
        ? 'No passkey for Helm was found on this device. Sign in another way, then add one from your account.'
        : 'Passkey sign-in did not work. Try again, or sign in another way.')
    }
  }, [next])

  useEffect(() => {
    if (!supported()) return
    // autofill: the browser offers saved passkeys when the email field is focused (Chrome, Safari, Edge)
    void PublicKeyCredential.isConditionalMediationAvailable?.().then((ok) => { if (ok) void signIn(true) })
    return () => autofill.current?.abort()
  }, [signIn])

  if (!available) return null
  return (
    <>
      <button type="button" disabled={busy} onClick={() => void signIn(false)} className="btn h-10 text-sm">
        <KeyRound aria-hidden className="size-4" />{busy ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
      </button>
      {error ? <p role="alert" className="m-0 text-xs text-crit-ink">{error}</p> : null}
    </>
  )
}

type Key = { id: string; friendly_name?: string; created_at: string; last_used_at?: string }
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

/**
 * The signed-in person's passkeys: add one on this device, see when each was last used, remove one.
 * With `then`, adding a passkey also counts as choosing how to sign in (first sign-in with an emailed code), and
 * the page moves on to `then`.
 */
export function PasskeyManager({ then }: { then?: string }) {
  const [keys, setKeys] = useState<Key[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const canUse = usePasskeySupport()
  const load = () => setVersion((v) => v + 1)
  useEffect(() => {
    let live = true
    void createClient().auth.passkey.list().then(({ data, error }) => {
      if (!live) return
      if (error) setError('Your passkeys could not be loaded.')
      setKeys((data as Key[] | null) ?? [])
    })
    return () => { live = false }
  }, [version])

  const add = async () => {
    setBusy(true); setError(null)
    const { error } = await createClient().auth.registerPasskey()
    if (error) {
      setBusy(false)
      if (!cancelled(error as never)) setError(/exists|already|excluded/i.test(error.message) ? 'This device already has a passkey for Helm.' : 'The passkey could not be added. Please try again.')
      return
    }
    if (then) {
      const res = await markSignInSet()
      if (!res.ok) { setBusy(false); setError(res.error); return }
      return go(then)
    }
    setBusy(false)
    load()
  }
  const remove = async (k: Key) => {
    if (!window.confirm(`Remove the passkey "${k.friendly_name || 'Passkey'}"? You can add it again later.`)) return
    const { error } = await createClient().auth.passkey.delete({ passkeyId: k.id })
    if (error) setError('The passkey could not be removed. Please try again.')
    load()
  }

  if (!canUse) return <p className="m-0 text-xs text-muted">This browser does not support passkeys.</p>
  return (
    <div className="flex flex-col gap-2">
      {keys?.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-2 text-[13px]">
              <KeyRound aria-hidden className="size-4 flex-none text-muted" />
              <span className="min-w-0 flex-1 truncate">{k.friendly_name || 'Passkey'}
                <span className="block text-[11px] text-muted">Added {day(k.created_at)}{k.last_used_at ? ` · last used ${day(k.last_used_at)}` : ''}</span>
              </span>
              <button type="button" onClick={() => void remove(k)} className="btn btn-ghost h-7 px-2 text-xs text-crit-ink">Remove</button>
            </li>
          ))}
        </ul>
      ) : keys ? <p className="m-0 text-xs text-muted">No passkeys yet.</p> : null}
      <button type="button" disabled={busy} onClick={() => void add()} className={then ? 'btn btn-primary h-10 text-sm' : 'btn h-9 text-sm'}>
        <KeyRound aria-hidden className="size-4" />{busy ? 'Follow your device…' : then ? 'Use a passkey instead' : 'Add a passkey on this device'}
      </button>
      {error ? <p role="alert" className="m-0 text-xs text-crit-ink">{error}</p> : null}
    </div>
  )
}
