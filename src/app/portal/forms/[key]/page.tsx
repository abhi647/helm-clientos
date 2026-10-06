import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormRenderer } from '@/components/form-renderer'
import { Card } from '@/components/ui'
import { formByKey } from '@/lib/forms'
import { requireCustomer } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Form' }

export default async function PortalForm({ params, searchParams }: {
  params: Promise<{ key: string }>; searchParams: Promise<{ project?: string; action?: string }>
}) {
  const [{ key }, sp] = await Promise.all([params, searchParams])
  const def = formByKey(key)
  if (!def) notFound()
  await requireCustomer()
  const supabase = await createClient()
  const { data: projects } = await supabase.from('projects').select('id, name').order('name')
  const project = sp.project ? projects?.find((p) => p.id === sp.project) : undefined
  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-3">
      <Link href="/portal" className="text-[13px]">← Home</Link>
      <h1 className="m-0 text-xl font-semibold">{def.title}{project ? <span className="font-normal text-muted"> · {project.name}</span> : null}</h1>
      <p className="m-0 text-[13px] text-muted">{def.intro}</p>
      <Card><FormRenderer def={def} projectId={project?.id} actionId={sp.action} projects={projects ?? []} /></Card>
    </div>
  )
}
