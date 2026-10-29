import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BrandLockup } from '@/components/brand'
import { requireProfile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Connect an AI tool', robots: { index: false, follow: false } }

/**
 * Supabase's OAuth server sends people here when an AI tool (Claude, ChatGPT, Cursor…) asks to use Helm as them.
 * Signed-out visitors go through /login first (the proxy brings them back). Approve or Deny posts to ./decide.
 */
export default async function Consent({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id } = await searchParams
  if (!authorization_id) redirect('/')
  const me = await requireProfile()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorization_id)
  if (data && !('authorization_id' in data)) redirect(data.redirect_url)   // already approved earlier
  const staff = me.kind === 'internal'
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-3">
        <div className="mb-4 flex items-center gap-2.5"><BrandLockup size={34} by /></div>
        {error || !data ? (
          <>
            <h1 className="m-0 text-xl font-semibold">This request has expired</h1>
            <p className="m-0 text-[13px] text-muted">Go back to the AI tool and connect Helm again.</p>
          </>
        ) : (
          <form action="/oauth/consent/decide" method="post" className="flex flex-col gap-3">
            <input type="hidden" name="authorization_id" value={authorization_id} />
            <h1 className="m-0 text-xl font-semibold">Connect {data.client.name || 'an AI tool'} to Helm?</h1>
            <p className="m-0 text-[13px] leading-relaxed text-muted">
              It will act as <b className="text-ink">{me.full_name}</b> and see only what you can see in Helm. It can read your projects, tasks, requests
              {staff ? ', approvals and weekly updates, and create and update tasks, log your time, comment, raise requests and move request stages' : ' and weekly updates, comment, and raise requests'}.
              It cannot delete anything, decide approvals, bill or change settings.
            </p>
            <p className="m-0 rounded-md bg-head px-3 py-2 text-xs text-muted">Returns you to <span className="font-mono text-ink">{new URL(data.redirect_uri).host}</span>. Remove access any time from the AI tool&apos;s connector settings.</p>
            <div className="flex gap-2">
              <button type="submit" name="decision" value="approve" autoFocus className="btn btn-primary h-10 flex-1 text-sm">Allow</button>
              <button type="submit" name="decision" value="deny" className="btn h-10 flex-1 text-sm">Deny</button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
