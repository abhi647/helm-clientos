import type { Metadata } from 'next'
import { RequestView } from '@/components/request-view'
import { requireStaff } from '@/lib/session'

export const metadata: Metadata = { title: 'Request' }

export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const me = await requireStaff()
  const [{ id }, { created }] = await Promise.all([params, searchParams])
  return <RequestView id={id} me={me} created={created} />
}
