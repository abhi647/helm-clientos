import { notFound, redirect } from 'next/navigation'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export default async function PortalApproval({ params }: { params: Promise<{ id: string }> }) {
  await requireCustomer()
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('approvals').select('request_id, project_id, page_id').eq('id', id).maybeSingle()
  if (!data) notFound()
  // a document's sign-off is decided on the document itself
  redirect(data.page_id ? `/portal/documents/pages/${data.page_id}` : data.request_id ? `/portal/requests/${data.request_id}` : `/portal/projects/${data.project_id}`)
}
