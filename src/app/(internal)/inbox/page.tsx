import type { Metadata } from 'next'
import { Inbox } from '@/components/inbox'
import { PageHeader } from '@/components/ui'
import { requireStaff } from '@/lib/session'

export const metadata: Metadata = { title: 'Inbox' }

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaff()
  const { tab } = await searchParams
  return <><PageHeader title="Inbox" /><div className="max-w-[900px] p-4"><Inbox tab={tab} basePath="/inbox" /></div></>
}
