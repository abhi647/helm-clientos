import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Approve or Deny from the consent page: Supabase answers with where to send the person back to the AI tool. */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const id = String(form.get('authorization_id') ?? '')
  const approve = form.get('decision') === 'approve'
  const supabase = await createClient()
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
  if (error || !data?.redirect_url) return NextResponse.redirect(new URL(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`, request.nextUrl.origin), 303)
  return NextResponse.redirect(data.redirect_url, 303)
}
