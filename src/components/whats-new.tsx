'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { IconArrowRight as ArrowRight, IconCalendar as Calendar, IconCalendarOff as CalendarOff, IconReceipt as Receipt, IconUsers as Users } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// bump with each release that has something to tell; everyone sees it once per release
const RELEASE = '2026-11-leave'
const KEY = `helm_whats_new_${RELEASE}`

type Item = { icon: React.ReactNode; title: string; body: string; href?: string; cta?: string }

const TEAM: Item[] = [
  { icon: <CalendarOff />, title: 'Leave, in Helm', href: '/leave', cta: 'Open Leave',
    body: 'Apply for casual, sick, earned or optional-holiday leave, half days included. You see your balance as you go, and your manager approves it from their Approvals tab.' },
  { icon: <Users />, title: 'Who is away', body: 'The team calendar shows everyone’s approved and waiting leave by month, so plans and handovers are easy.' },
  { icon: <Calendar />, title: 'The holiday list', body: 'Company holidays for the year, with optional holidays. They are not working days anywhere in Helm.' },
  { icon: <Receipt />, title: 'Billing and timesheets follow leave', body: 'Approved leave and holidays come off dedicated billing automatically, and show on your weekly timesheet.' },
]

const CUSTOMER: Item[] = [
  { icon: <Users />, title: 'See when your team is away', body: 'Your portal now shows when the Seven Billion people on your work have planned leave in the next six weeks.' },
]

/** Once per release, a short note on what changed. Remembered in this browser; nothing is stored about the person. */
export function WhatsNew({ audience }: { audience: 'team' | 'customer' }) {
  // seen before in this browser (or switched off for tests and demos); on the server, assume seen
  const seen = useSyncExternalStore(() => () => {}, () => {
    try { return !!localStorage.getItem(KEY) || !!localStorage.getItem('helm_whats_new_off') } catch { return true }
  }, () => true)
  const [dismissed, setDismissed] = useState(false)
  const open = !seen && !dismissed
  const close = () => {
    setDismissed(true)
    try { localStorage.setItem(KEY, new Date().toISOString()) } catch { /* nothing to remember */ }
  }
  const items = audience === 'team' ? TEAM : CUSTOMER
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <p className="m-0 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_16%,transparent)]" />What&apos;s new
          </p>
          <DialogTitle className="text-lg">{audience === 'team' ? 'Leave and holidays are now in Helm' : 'See when your team is away'}</DialogTitle>
          <DialogDescription>Here is what changed in this update.</DialogDescription>
        </DialogHeader>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {items.map((it) => (
            <li key={it.title} className="flex gap-3">
              <span aria-hidden className="grid size-8 flex-none place-items-center rounded-lg bg-primary/10 text-primary [&>svg]:size-4">{it.icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{it.title}</span>
                <span className="block text-[13px] leading-relaxed text-muted-foreground">{it.body}</span>
                {it.href ? <Link href={it.href} onClick={close} className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium">{it.cta}<ArrowRight className="size-3.5" /></Link> : null}
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={close}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
