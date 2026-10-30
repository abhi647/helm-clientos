'use client'

import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'

/**
 * Task details as a panel that slides in from the right, over the plan. The open task lives in the URL (?task=), so
 * links and the back button still work; closing goes to `closeHref`. The plan stays usable behind it: picking another
 * task swaps the panel's content.
 */
export function TaskDrawer({ closeHref, title, children }: { closeHref: string; title: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <Sheet open modal={false} onOpenChange={(open) => { if (!open) router.push(closeHref, { scroll: false }) }}>
      <SheetContent side="right" onInteractOutside={(e) => e.preventDefault()} onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-full gap-0 overflow-y-auto border-l border-border p-0 shadow-pop sm:max-w-[520px]">
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">Task details, status, owner, subtasks, time and discussion</SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  )
}
