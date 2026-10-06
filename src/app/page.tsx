import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/session'

/** Staff land on their home, customers on their portal. */
export default async function Root() {
  const profile = await requireProfile()
  redirect(profile.kind === 'customer' ? '/portal' : '/home')
}
