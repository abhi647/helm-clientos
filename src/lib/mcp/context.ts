import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { AuthInfo } from '@modelcontextprotocol/server'
import type { Database, Tables } from '@/lib/database.types'

/**
 * Helm over MCP (Claude, ChatGPT, Cursor…). An AI tool signs in through Supabase's OAuth server as one person and
 * sends that person's access token with every call. Every query below runs with that token, so Row Level Security
 * decides what the AI can see and change: exactly what the person could in the app, never more.
 */
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const userClient = (token: string) => createSupabaseClient<Database>(url(), key(), {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
export type HelmDb = ReturnType<typeof userClient>

/** Checks a bearer token with Supabase Auth. Undefined (so a 401 and a sign-in prompt) when it is missing or expired. */
export async function verifyToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined
  const { data, error } = await userClient(bearer).auth.getClaims(bearer)
  const claims = data?.claims as { sub?: string; exp?: number; client_id?: string; scope?: string } | undefined
  if (error || !claims?.sub) return undefined
  return { token: bearer, clientId: claims.client_id ?? 'helm', scopes: (claims.scope ?? '').split(' ').filter(Boolean), expiresAt: claims.exp }
}

export type Me = Tables<'profiles'>
export type Helm = { db: HelmDb; me: Me; staff: boolean; manager: boolean }

export class HelmError extends Error {}

/** The signed-in person behind a tool call, and a database client acting as them. */
export async function helm(authInfo: AuthInfo | undefined): Promise<Helm> {
  if (!authInfo?.token) throw new HelmError('Not signed in to Helm. Reconnect the Helm connector.')
  const db = userClient(authInfo.token)
  const { data: me } = await db.rpc('get_my_profile')
  if (!me?.id) throw new HelmError('This account has not been given access to Helm yet. Ask your Seven Billion team.')
  const staff = me.kind === 'internal'
  return { db, me, staff, manager: staff && ['admin', 'ceo', 'pm'].includes(me.internal_role ?? '') }
}
