/**
 * How long someone stays signed in: 30 days from their last visit. The session refreshes itself while Helm is in use
 * (each refresh rewrites the cookie), so active people never sign in again; after 30 days away they do.
 * Secure and same-site (lax), never readable by other sites. Removing someone's access still ends it immediately.
 */
export const SESSION_COOKIE = {
  maxAge: 60 * 60 * 24 * 30,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}
