'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

type Provider = 'google' | 'azure'
const NAME: Record<Provider, string> = { google: 'Google', azure: 'Microsoft' }

/**
 * Connect a Google or Microsoft account to the Helm account you are signed in to, even when its email differs
 * (a personal Gmail for a work-email invite). Afterwards "Continue with Google" with that account signs you in here.
 */
export function ConnectIdentity({ provider, connected, canRemove }: { provider: Provider; connected: boolean; canRemove: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const connect = () => start(async () => {
    const redirectTo = `${window.location.origin}/auth/confirm?linked=${provider}&next=${encodeURIComponent('/account/profile')}`
    const { error } = await createClient().auth.linkIdentity({ provider, options: { redirectTo, queryParams: { prompt: 'select_account' } } })
    if (error) toast.error(/manual linking/i.test(error.message) ? `Connecting ${NAME[provider]} is not switched on yet. Ask an admin.` : `Could not connect ${NAME[provider]}. Please try again.`)
  })

  const disconnect = () => start(async () => {
    const supabase = createClient()
    const { data } = await supabase.auth.getUserIdentities()
    const identity = data?.identities.find((i) => i.provider === provider)
    if (!identity) { router.refresh(); return }
    const { error } = await supabase.auth.unlinkIdentity(identity)
    if (error) { toast.error(`Could not disconnect ${NAME[provider]}. Please try again.`); return }
    toast.success(`${NAME[provider]} disconnected.`)
    router.refresh()
  })

  if (!connected) return <Button type="button" size="sm" variant="outline" disabled={pending} onClick={connect}>Connect</Button>
  if (!canRemove) return null
  return <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={disconnect}>Disconnect</Button>
}
