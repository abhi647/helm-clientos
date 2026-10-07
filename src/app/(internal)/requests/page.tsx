import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import { RequestList, parseFilter } from '@/components/request-list'
import { requireStaff } from '@/lib/session'

export const metadata: Metadata = { title: 'Requests' }

export default async function Requests({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const me = await requireStaff()
  const { filter } = await searchParams
  return (
    <>
      <PageHeader title="Requests" meta={<span className="text-xs text-muted">All customers</span>} actions={<Link href="/requests/new" className="btn btn-primary">+ Log a request</Link>} />
      <div className="p-4"><RequestList me={me} filter={parseFilter(filter)} basePath="/requests" /></div>
    </>
  )
}
