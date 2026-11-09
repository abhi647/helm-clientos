'use client'

import Link from 'next/link'
import { FileText, FolderPlus, Plus } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { btn } from '@/components/ui'

/** "New" in the top bar: the things people create most, one click from anywhere. */
export function QuickCreate({ canCreateProject }: { canCreateProject: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={btn('default', 'gap-1 px-2.5 max-sm:size-10 max-sm:px-0')} aria-label="Create">
        <Plus className="size-4" aria-hidden /><span className="max-sm:hidden">New</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild><Link href="/requests/new" className="no-underline"><FileText />Request</Link></DropdownMenuItem>
        {canCreateProject ? <DropdownMenuItem asChild><Link href="/projects/new" className="no-underline"><FolderPlus />Project</Link></DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
