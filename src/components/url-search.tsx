'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { SearchField } from '@/components/overtrue/search-field'

/**
 * overtrue's SearchField for a search that lives in the address (?q=…): Enter applies it, clearing it removes it.
 * `keep` carries the other parameters (view, filters…) along.
 */
export function UrlSearch({ label, placeholder, defaultValue = '', keep, name = 'q', className }: {
  label: string; placeholder?: string; defaultValue?: string; keep: Record<string, string | undefined>; name?: string; className?: string
}) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue)
  const [pending, start] = useTransition()
  const go = (q: string) => {
    const next = new URLSearchParams(Object.entries(keep).filter(([, v]) => v) as [string, string][])
    if (q.trim()) next.set(name, q.trim())
    const s = next.toString()
    start(() => router.push(s ? `?${s}` : '?', { scroll: false }))
  }
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); go(value) }} className={className}>
      <SearchField label={label} placeholder={placeholder} value={value} containerClassName="w-52"
        className={pending ? 'h-8 text-[13px] opacity-70' : 'h-8 text-[13px]'}
        onValueChange={(v) => { setValue(v); if (!v && defaultValue) go('') }} />
    </form>
  )
}
