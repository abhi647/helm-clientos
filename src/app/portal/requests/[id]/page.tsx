import type { Metadata } from 'next'
import { OpenSurveys } from '@/components/csat-open'
import { RequestView } from '@/components/request-view'
import { requireCustomer } from '@/lib/session'

export const metadata: Metadata = { title: 'Request' }

export default async function PortalRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const me = await requireCustomer()
  const [{ id }, { created }] = await Promise.all([params, searchParams])
  return <div className="flex flex-col gap-3"><OpenSurveys me={me} requestId={id} /><div className="-mx-4"><RequestView id={id} me={me} created={created} /></div></div>
}
