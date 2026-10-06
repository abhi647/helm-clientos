'use client'

import Image from 'next/image'
import { useSyncExternalStore } from 'react'

type Slot = 'morning' | 'afternoon' | 'evening' | 'night'
const HELLO: Record<Slot, string> = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Hello' }
const FOCUS: Record<Slot, string> = { morning: 'center 60%', afternoon: 'center 55%', evening: 'center 45%', night: 'center 40%' }

const slotOf = (h: number): Slot => (h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night')
// read the viewer's own clock; the server renders the morning version and the client corrects it after hydration
const subscribe = () => () => {}
const clientSlot = () => slotOf(new Date().getHours())
const serverSlot = (): Slot => 'morning'

/**
 * A calm, time-of-day greeting with a landscape photo (Unsplash licence: free to use, no attribution required).
 * `lines` lets each page say something friendly and specific for each part of the day.
 */
export function Greeting({ name, lines, chips, compact }: {
  name: string
  lines: Record<Slot, string>
  chips?: React.ReactNode
  compact?: boolean
}) {
  const slot = useSyncExternalStore(subscribe, clientSlot, serverSlot)
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <section aria-label="Greeting" className={`relative flex items-end overflow-hidden rounded-md bg-rail ${compact ? 'min-h-[124px]' : 'min-h-[168px]'}`}>
      <Image src={`/greeting/${slot}.jpg`} alt="" fill priority sizes="(max-width: 1400px) 100vw, 1400px" className="object-cover" style={{ objectPosition: FOCUS[slot] }} />
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,24,28,.82)_0%,rgba(8,24,28,.5)_48%,rgba(8,24,28,.08)_88%)]" />
      <div className={`relative flex w-full flex-wrap items-end gap-x-6 gap-y-3 text-white ${compact ? 'px-[18px] py-3.5' : 'px-6 py-5'}`}>
        <div className="flex min-w-[260px] flex-1 flex-col gap-1">
          <span suppressHydrationWarning className="text-xs font-medium opacity-90">{today}</span>
          <h1 className={`m-0 font-semibold tracking-[-0.01em] ${compact ? 'text-[22px]' : 'text-[26px]'}`}>{HELLO[slot]}, {name}</h1>
          <p className="m-0 max-w-[560px] text-sm opacity-95">{lines[slot]}</p>
        </div>
        {chips ? <div className="flex flex-wrap gap-2">{chips}</div> : null}
      </div>
      <span className="absolute right-2 bottom-1 text-[10px] text-white/75">Photo: Unsplash</span>
    </section>
  )
}

export function GreetingChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-white/30 bg-white/15 px-2.5 py-1.5 text-xs">{children}</span>
}
