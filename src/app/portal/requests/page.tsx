import type { Metadata } from 'next'
import { RequestList, parseFilter } from '@/components/request-list'
import { requireCustomer } from '@/lib/session'

export const metadata: Metadata = { title: 'Requests' }

export default async function PortalRequests({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const me = await requireCustomer()
  const { filter } = await searchParams
  return (
    <div className="flex flex-col gap-3">
      <h1 className="m-0 text-xl font-semibold">Requests</h1>
      <RequestList me={me} filter={parseFilter(filter)} basePath="/portal/requests" />
    </div>
  )
}
