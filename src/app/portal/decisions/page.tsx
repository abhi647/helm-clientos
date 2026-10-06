import type { Metadata } from 'next'
import { DecisionRows } from '@/components/meeting-parts'
import { Card } from '@/components/ui'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Decisions' }

export default async function PortalDecisions() {
  await requireCustomer()
  const supabase = await createClient()
  const { data } = await supabase.from('decisions').select('id, number, decision, decided_on, decided_by, visibility, projects(name)').order('decided_on', { ascending: false })
  return (
    <Card flush title="Decision log" extra="Everything we agreed, numbered and dated">
      <DecisionRows decisions={(data ?? []).map((d) => ({ ...d, decided_by: [d.projects?.name, d.decided_by].filter(Boolean).join(' · ') }))} staff={false} />
    </Card>
  )
}
