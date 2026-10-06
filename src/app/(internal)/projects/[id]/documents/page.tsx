import { DocumentsPanel } from '@/components/project-parts'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export default async function ProjectDocuments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requireStaff()
  const supabase = await createClient()
  const { data: p } = await supabase.from('projects').select('customer_id').eq('id', id).single()
  return <div className="p-4">{p ? <DocumentsPanel me={me} customerId={p.customer_id} projectId={id} /> : null}</div>
}
