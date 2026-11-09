'use client'

import { useRouter } from 'next/navigation'
import { useTransition, type ReactNode } from 'react'
import { FilterTabs } from '@/components/overtrue/filter-tabs'

/** overtrue's FilterTabs for filters that live in the URL: picking one navigates to its link. */
export function LinkTabs({ label, value, items, className }: {
  label: string; value: string; items: { value: string; label: ReactNode; href: string; count?: number }[]; className?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <FilterTabs label={label} value={value} items={items} className={className ? `${className}${pending ? ' opacity-70' : ''}` : pending ? 'opacity-70' : undefined}
      onValueChange={(v) => { const to = items.find((i) => i.value === v)?.href; if (to) start(() => router.push(to)) }} />
  )
}
