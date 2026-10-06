import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MfaForm } from './mfa-form'

export const metadata: Metadata = { title: 'Two-step sign-in' }

/** Seven Billion staff confirm every sign-in with an authenticator app. Staff data stays locked until they do. */
export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/login')
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/home'
  return (
    <main className="flex min-h-screen items-center justify-center bg-head px-4 py-10">
      <div className="card w-full max-w-[420px] p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-ink text-xs font-bold text-white">7B</span>
          <span className="text-sm font-semibold">Seven Billion · Client OS</span>
        </div>
        <MfaForm next={safeNext} />
      </div>
    </main>
  )
}
