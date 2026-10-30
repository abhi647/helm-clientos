'use client'

import { useSyncExternalStore } from 'react'

type Slot = 'morning' | 'afternoon' | 'evening' | 'night'
const HELLO: Record<Slot, string> = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Hello' }

const slotOf = (h: number): Slot => (h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night')
// read the viewer's own clock; the server renders the morning version and the client corrects it after hydration
const subscribe = () => () => {}
const clientSlot = () => slotOf(new Date().getHours())
const serverSlot = (): Slot => 'morning'

/**
 * A one-line, time-of-day greeting with the day's summary and a few figures beside it. Kept slim so the page
 * opens on data, not on a banner.
 */
export function Greeting({ name, lines, chips }: {
  name: string
  lines: Record<Slot, string>
  chips?: React.ReactNode
  compact?: boolean
}) {
  const slot = useSyncExternalStore(subscribe, clientSlot, serverSlot)
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <section aria-label="Greeting" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="m-0 text-[19px] leading-tight font-semibold tracking-[-0.02em]">{HELLO[slot]}, {name}
          <span suppressHydrationWarning className="ml-2 text-xs font-normal text-muted-foreground">{today}</span></h1>
        <p className="m-0 text-xs text-muted-foreground">{lines[slot]}</p>
      </div>
      {chips ? <div className="flex flex-wrap gap-1.5">{chips}</div> : null}
    </section>
  )
}

export function GreetingChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground [&_b]:text-foreground">{children}</span>
}
