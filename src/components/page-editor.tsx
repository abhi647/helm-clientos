'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plate, usePlateEditor, usePluginOption } from 'platejs/react'
import type { Value } from 'platejs'
import { SuggestionPlugin } from '@platejs/suggestion/react'
import { AutoformatKit } from '@/components/editor/plugins/autoformat-kit'
import { BasicNodesKit } from '@/components/editor/plugins/basic-nodes-kit'
import { BlockPlaceholderKit } from '@/components/editor/plugins/block-placeholder-kit'
import { CommentKit } from '@/components/editor/plugins/comment-kit'
import { DiscussionKit, discussionPlugin, type DiscussionUser, type TDiscussion } from '@/components/editor/plugins/discussion-kit'
import { DndKit } from '@/components/editor/plugins/dnd-kit'
import { ExitBreakKit } from '@/components/editor/plugins/exit-break-kit'
import { FloatingToolbarKit } from '@/components/editor/plugins/floating-toolbar-kit'
import { IndentKit } from '@/components/editor/plugins/indent-kit'
import { LinkKit } from '@/components/editor/plugins/link-kit'
import { ListKit } from '@/components/editor/plugins/list-kit'
import { SlashKit } from '@/components/editor/plugins/slash-kit'
import { SuggestionKit } from '@/components/editor/plugins/suggestion-kit'
import { TableKit } from '@/components/editor/plugins/table-kit'
import { Editor, EditorContainer } from '@/components/ui/editor'
import { FixedToolbar } from '@/components/ui/fixed-toolbar'
import { FixedToolbarButtons } from '@/components/ui/fixed-toolbar-buttons'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { btn } from '@/components/ui'

const PLUGINS = [
  ...BasicNodesKit, ...IndentKit, ...ListKit, ...TableKit, ...LinkKit, ...AutoformatKit, ...ExitBreakKit, ...SlashKit, ...BlockPlaceholderKit,
  ...DndKit, ...DiscussionKit, ...CommentKit, ...SuggestionKit, ...FloatingToolbarKit,
]
const HEARTBEAT_MS = 25_000   // the lock lasts 60 s; someone else's is re-checked every 15 s
const WAIT_MS = 15_000
const SAVE_AFTER_MS = 1_200

type SaveState = { kind: 'saved' | 'saving' | 'unsaved' } | { kind: 'error' | 'conflict'; message: string }

// threads are stored as JSON, so their dates come back as strings
const hydrate = (list: TDiscussion[]): TDiscussion[] => list.map((d) => ({
  ...d, createdAt: new Date(d.createdAt), comments: d.comments.map((c) => ({ ...c, createdAt: new Date(c.createdAt) })),
}))

/**
 * A Helm document in Plate. One person edits at a time: opening it takes a lock that renews while the page is open,
 * and anyone else sees it read-only with who is editing. Changes save on their own a moment after typing stops;
 * each save is a version, checked against the one this editor started from so nobody overwrites someone else.
 * Customers write in Suggesting mode: their changes show as suggestions the team accepts or rejects.
 */
export function PageEditor({ pageId, initial, discussions, version: startVersion, users, me, canWrite, customer, title }: {
  pageId: string; initial: Value; discussions: TDiscussion[]; version: number
  users: Record<string, DiscussionUser>; me: string; canWrite: boolean; customer: boolean; title?: string
}) {
  const router = useRouter()
  const [holder, setHolder] = useState<string | null>(null)
  const [state, setState] = useState<SaveState>({ kind: 'saved' })
  const version = useRef(startVersion)
  const [shown, setShown] = useState(startVersion)   // the saved version, for the status line
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readOnly = !canWrite || !!holder

  const editor = usePlateEditor({
    plugins: PLUGINS,
    value: initial.length ? initial : [{ type: 'p', children: [{ text: '' }] }],
    readOnly,
  }, [])

  // who is who in comments and suggestions
  useEffect(() => {
    editor.setOption(discussionPlugin, 'currentUserId', me)
    editor.setOption(discussionPlugin, 'users', users)
    editor.setOption(discussionPlugin, 'discussions', hydrate(discussions))
    editor.setOption(SuggestionPlugin, 'currentUserId', me)
    if (customer) editor.setOption(SuggestionPlugin, 'isSuggesting', true)
  }, [editor, me, users, discussions, customer])

  // the editing lock: take it, renew it, give it back
  useEffect(() => {
    if (!canWrite) return
    const supabase = createClient()
    let live = true
    const claim = async () => {
      const { data, error } = await supabase.rpc('claim_page', { p_page: pageId })
      if (!live) return
      if (error) setState({ kind: 'error', message: 'Could not open this document for editing.' })
      else setHolder(data ?? null)
    }
    void claim()
    const beat = setInterval(claim, holder ? WAIT_MS : HEARTBEAT_MS)
    return () => { live = false; clearInterval(beat) }
  }, [pageId, canWrite, holder])
  // give the lock back when leaving the page
  useEffect(() => {
    if (!canWrite) return
    return () => { void createClient().rpc('claim_page', { p_page: pageId, p_release: true }) }
  }, [pageId, canWrite])

  const save = useCallback(async () => {
    timer.current = null
    setState({ kind: 'saving' })
    const { data, error } = await createClient().rpc('save_page', {
      p_page: pageId, p_base: version.current, p_content: editor.children as never,
      p_discussions: editor.getOption(discussionPlugin, 'discussions') as never, p_title: title,
    })
    if (error) {
      setState(/saved by someone else|reload/i.test(error.message)
        ? { kind: 'conflict', message: 'Someone else saved this document. Reload to see their changes before you continue.' }
        : /someone else is editing/i.test(error.message) ? { kind: 'conflict', message: 'Someone else is editing now. Your last change was not saved.' }
        : { kind: 'error', message: 'Not saved. Check your connection; Helm will try again with your next change.' })
      return
    }
    version.current = data
    setShown(data)
    setState({ kind: 'saved' })
  }, [editor, pageId, title])

  const schedule = useCallback(() => {
    if (readOnly || state.kind === 'conflict') return
    setState({ kind: 'unsaved' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), SAVE_AFTER_MS)
  }, [readOnly, save, state.kind])

  // a renamed title saves too
  const firstTitle = useRef(title)
  useEffect(() => { if (title !== firstTitle.current) { firstTitle.current = title; schedule() } }, [title, schedule])

  // leaving with unsaved changes: save first, and warn if the browser closes before it can
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (timer.current) { e.preventDefault(); void save() } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [save])

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-6 flex-wrap items-center gap-2 text-xs">
        {holder ? <span className="rounded-full bg-warn-bg px-2 py-0.5 font-medium text-warn-ink">{holder} is editing. You can read it; it opens for you when they finish.</span>
          : !canWrite ? <span className="text-muted-foreground">Read only</span>
          : customer ? <span className="rounded-full bg-info-bg px-2 py-0.5 font-medium text-info-ink">Suggesting: your changes show as suggestions for the team to accept</span>
          : null}
        <span className={cn('ml-auto', state.kind === 'error' || state.kind === 'conflict' ? 'font-medium text-crit-ink' : 'text-muted-foreground')} role="status" aria-live="polite">
          {state.kind === 'saved' ? `Saved · version ${shown}` : state.kind === 'saving' ? 'Saving…' : state.kind === 'unsaved' ? 'Unsaved changes' : 'message' in state ? state.message : ''}
        </span>
        {state.kind === 'conflict' ? <button type="button" className={btn('outline', 'h-6 px-2 text-xs')} onClick={() => router.refresh()}>Reload</button> : null}
      </div>
      <Plate editor={editor} readOnly={readOnly} onValueChange={schedule}>
        <DiscussionSaver onChange={schedule} initial={JSON.stringify(discussions)} />
        <div className="card overflow-hidden">
          {!readOnly ? <FixedToolbar className="rounded-none"><FixedToolbarButtons suggestOnly={customer} /></FixedToolbar> : null}
          <EditorContainer className="max-h-none">
            <Editor variant="default" className="min-h-[60vh] px-8 py-6 text-[14px] sm:px-14" placeholder="Type / for headings, lists, tables…" />
          </EditorContainer>
        </div>
      </Plate>
    </div>
  )
}

/** Saves when a comment thread is added, answered or resolved (threads live beside the text, not in it). */
function DiscussionSaver({ onChange, initial }: { onChange: () => void; initial: string }) {
  const threads = usePluginOption(discussionPlugin, 'discussions')
  const last = useRef(initial)
  useEffect(() => {
    const now = JSON.stringify(threads)
    // loading the saved threads is not a change
    if (now === last.current || (threads.length === 0 && last.current === '[]')) return
    if (last.current === initial && now === JSON.stringify(hydrate(JSON.parse(initial)))) { last.current = now; return }
    last.current = now
    onChange()
  }, [threads, onChange, initial])
  return null
}
