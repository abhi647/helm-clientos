'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { IconArrowRight as ArrowRight, IconLayoutDashboard as Layout, IconReceipt as Receipt, IconSparkles as Sparkles, IconTable as Table } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// bump with each release that has something to tell; everyone sees it once per release
const RELEASE = '2026-11-ask-helm'
const KEY = `helm_whats_new_${RELEASE}`

type Item = { icon: React.ReactNode; title: string; body: string; href?: string; cta?: string }

const TEAM: Item[] = [
  { icon: <Sparkles />, title: 'Ask Helm: an AI assistant', href: '/assistant', cta: 'Try it',
    body: 'Type what you need: "log 3h on Kickoff today", "raise a bug for Nesma", "what is overdue?". It looks things up for you, and every change waits for you to confirm it. Open it from the sidebar, the Ask button, or ⌘J on any page.' },
  { icon: <Layout />, title: 'A new, denser design', body: 'Every screen is rebuilt on one design system: clearer panels, status badges and figures, and more on each screen.' },
  { icon: <Table />, title: 'Tables you can search and sort', body: 'Projects, customers, requests, invoices, timesheets and more: click a column to sort, type to search, and click a row to open it.' },
  { icon: <Receipt />, title: 'Billing: deliverables and sales orders', body: 'Bill per report or deliverable from the Billing tab, set what each phase is billed as from the plan, and approved statements now become a Zoho sales order first.' },
]

const CUSTOMER: Item[] = [
  { icon: <Layout />, title: 'A cleaner Helm', body: 'Your portal has a new design: clearer status, and lists you can sort and search.' },
  { icon: <Table />, title: 'Find things faster', body: 'Invoices, hours, statements and meetings: click a column to sort, or type to search.' },
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
          <DialogTitle className="text-lg">{audience === 'team' ? 'Helm just got an assistant, and a new look' : 'Helm has a new look'}</DialogTitle>
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
