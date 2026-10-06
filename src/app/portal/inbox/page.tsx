import type { Metadata } from 'next'
import { Inbox } from '@/components/inbox'
import { requireCustomer } from '@/lib/session'

export const metadata: Metadata = { title: 'Notifications' }

export default async function PortalInbox({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireCustomer()
  const { tab } = await searchParams
  return <div className="flex max-w-[900px] flex-col gap-3"><h1 className="m-0 text-xl font-semibold">Notifications</h1><Inbox tab={tab} basePath="/portal/inbox" /></div>
}
