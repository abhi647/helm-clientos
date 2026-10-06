import type { Metadata } from 'next'
import { DocumentsPanel } from '@/components/project-parts'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Documents' }

export default async function PortalDocuments() {
  const me = await requireCustomer()
  const supabase = await createClient()
  const { data: projects } = await supabase.from('projects').select('id, name').order('name')
  return (
    <div className="flex flex-col gap-3">
      <h1 className="m-0 text-xl font-semibold">Documents</h1>
      <DocumentsPanel me={me} customerId={me.customer_id!} projects={projects ?? []} />
    </div>
  )
}
