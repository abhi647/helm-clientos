/**
 * How someone last signed in. Kept in two places:
 *  - a cookie on this device, so the sign-in page can say "Last used" next to the right button and fill in the email;
 *  - the profile (note_sign_in), so the person and admins can see it.
 */
export const SIGN_IN_METHODS = ['google', 'azure', 'passkey', 'password', 'code'] as const
export type SignInMethod = (typeof SIGN_IN_METHODS)[number]

export const METHOD_LABEL: Record<SignInMethod, string> = {
  google: 'Google',
  azure: 'Microsoft',
  passkey: 'Passkey',
  password: 'Password',
  code: 'Email code',
}

export const LAST_SIGN_IN_COOKIE = 'helm_last_sign_in'
export const LAST_SIGN_IN_MAX_AGE = 60 * 60 * 24 * 400 // the longest browsers keep a cookie

export const isMethod = (v: unknown): v is SignInMethod => typeof v === 'string' && (SIGN_IN_METHODS as readonly string[]).includes(v)

export type LastSignIn = { method: SignInMethod; email: string | null }

export function encodeLastSignIn(method: SignInMethod, email?: string | null) {
  return encodeURIComponent(JSON.stringify({ m: method, e: email ?? null }))
}

export function parseLastSignIn(raw: string | undefined | null): LastSignIn | null {
  if (!raw) return null
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as { m?: unknown; e?: unknown }
    if (!isMethod(v.m)) return null
    const email = typeof v.e === 'string' && v.e.length <= 254 && v.e.includes('@') ? v.e : null
    return { method: v.m, email }
  } catch {
    return null
  }
}
