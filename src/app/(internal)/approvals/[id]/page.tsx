import { notFound, redirect } from 'next/navigation'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/** Approval links in emails point here; approvals are shown on the request (or project) they belong to. */
export default async function ApprovalRedirect({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff()
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('approvals').select('request_id, project_id, page_id').eq('id', id).maybeSingle()
  if (!data) notFound()
  redirect(data.page_id ? `/projects/${data.project_id}/docs/${data.page_id}` : data.request_id ? `/requests/${data.request_id}` : `/projects/${data.project_id}`)
}
