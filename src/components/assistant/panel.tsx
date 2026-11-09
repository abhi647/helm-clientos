'use client'

import { useEffect, useState } from 'react'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { IconSparkles as Sparkles } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AssistantChat } from './chat'

/** Where the person is, in words the assistant can act on (it looks the ids up with its tools). */
function usePage() {
  const path = usePathname()
  const params = useParams<{ id?: string }>()
  const task = useSearchParams().get('task')
  if (path.startsWith('/projects/') && params.id) return `the project with id ${params.id}${task ? `, looking at the task with id ${task}` : ''} (page ${path})`
  if (path.startsWith('/requests/') && params.id) return `the request with id ${params.id} (page ${path})`
  if (path.startsWith('/customers/') && params.id) return `the customer with id ${params.id} (page ${path})`
  return path === '/' ? undefined : `the ${path.split('/')[1]} page`
}

/** "Ask" in the top bar (or ⌘J): the assistant in a side panel that knows the page you are on. */
export function AssistantPanel() {
  const [open, setOpen] = useState(false)
  const [chat, setChat] = useState<string>()
  const page = usePage()
  const path = usePathname()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen((o) => !o) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (path.startsWith('/assistant')) return null
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-keyshortcuts="Meta+J" title="Ask Helm (⌘J)">
        <Sparkles className="text-primary" /><span className="max-sm:sr-only">Ask</span>
      </Button>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]">
        <SheetHeader className="border-b border-border/60 px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-[15px]"><Sparkles className="size-4 text-primary" />Ask Helm</SheetTitle>
          <SheetDescription className="text-xs">
            Knows the page you are on. <Link href={chat ? `/assistant?chat=${chat}` : '/assistant'} onClick={() => setOpen(false)}>Open full page</Link>
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <AssistantChat key={chat ?? 'new'} chatId={chat} page={page} compact onChat={(id) => setChat(id)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
