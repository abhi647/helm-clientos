'use client'

import { useState } from 'react'
import type { Value } from 'platejs'
import dynamic from 'next/dynamic'
import type { DiscussionUser, TDiscussion } from '@/components/editor/plugins/discussion-kit'

// the editor runs only in the browser (selection, drag and drop); the page around it renders on the server
const PageEditor = dynamic(() => import('@/components/page-editor').then((m) => m.PageEditor), {
  ssr: false, loading: () => <div className="card min-h-[60vh] animate-pulse bg-muted/40" aria-busy="true" />,
})

/** Title and body together, so a renamed title saves with the next version. Staff can rename; customers cannot. */
export function PageWorkspace(props: {
  pageId: string; title: string; content: Value; discussions: TDiscussion[]; version: number
  users: Record<string, DiscussionUser>; me: string; canWrite: boolean; customer: boolean
}) {
  const [title, setTitle] = useState(props.title)
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {props.customer || !props.canWrite
        ? <h1 className="m-0 text-[22px] leading-tight font-semibold tracking-[-0.02em]">{props.title}</h1>
        : <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Document title"
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[22px] leading-tight font-semibold tracking-[-0.02em] outline-none hover:border-border focus:border-primary" />}
      <PageEditor pageId={props.pageId} initial={props.content} discussions={props.discussions} version={props.version}
        users={props.users} me={props.me} canWrite={props.canWrite} customer={props.customer}
        title={props.customer ? undefined : title.trim() || props.title} />
    </div>
  )
}
