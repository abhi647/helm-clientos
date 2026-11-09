'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconArrowUp as ArrowUp, IconCheck as Check, IconLoader2 as Loader, IconSparkles as Sparkles, IconX as X } from '@tabler/icons-react'
import { cancelProposal, confirmProposal } from '@/app/_actions/assistant'
import { StatusBadge } from '@/components/overtrue/status-badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { AssistantEvent } from '@/lib/assistant/agent'

export type ProposalState = 'pending' | 'confirmed' | 'cancelled' | 'failed'
export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; id: string; title: string; ok?: boolean }
  | { kind: 'proposal'; id: string; title: string; summary: string; status: ProposalState; note?: string; link?: string }
  | { kind: 'error'; text: string }

const SUGGESTIONS = [
  'What is on my plate this week?',
  'Log 3 hours on the Kickoff task for today',
  'Create a bug request for Nesma: the dashboard filter is broken, high priority',
  'Which approvals are waiting on customers?',
]

/** Plain text with web links made clickable (the assistant writes short plain replies). */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g)
  return <>{parts.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} href={p} className="break-all">{p.replace(/^https?:\/\/[^/]+/, '')}</a> : p))}</>
}

function Proposal({ item, onChange }: { item: Extract<ChatItem, { kind: 'proposal' }>; onChange: (next: Partial<Extract<ChatItem, { kind: 'proposal' }>>) => void }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  const [what, ...details] = item.summary.split(' · ')
  return (
    <div data-slot="proposal" className={cn('rounded-xl border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]', item.status === 'pending' ? 'border-primary/30' : 'border-border/70')}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">{what}</span>
        <span className="ml-auto">
          {item.status === 'pending' ? <StatusBadge variant="info" live>Waiting for you</StatusBadge>
            : item.status === 'confirmed' ? <StatusBadge variant="success">Saved</StatusBadge>
            : item.status === 'failed' ? <StatusBadge variant="error">Not saved</StatusBadge>
            : <StatusBadge variant="neutral">Cancelled</StatusBadge>}
        </span>
      </div>
      {details.length ? (
        <dl className="m-0 mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          {details.map((d) => {
            const [k, ...v] = d.split(': ')
            return <div key={d} className="contents"><dt className="text-muted-foreground first-letter:uppercase">{k}</dt><dd className="m-0 break-words">{v.join(': ')}</dd></div>
          })}
        </dl>
      ) : null}
      {item.note ? <p className={cn('m-0 mt-2 text-xs', item.status === 'failed' ? 'text-crit-ink' : 'text-muted-foreground')}>{item.note}</p> : null}
      {item.link && item.status === 'confirmed' ? <a href={item.link} className="mt-1 inline-block text-xs">Open in Helm →</a> : null}
      {item.status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => start(async () => {
            const res = await confirmProposal(item.id)
            onChange(res.ok ? { status: 'confirmed', link: res.link } : { status: res.error.includes('already') ? 'cancelled' : 'failed', note: res.error })
            router.refresh()
          })}>{pending ? <Loader className="animate-spin" /> : <Check />}Confirm</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => {
            const res = await cancelProposal(item.id)
            onChange(res.ok ? { status: 'cancelled' } : { note: res.error })
          })}><X />Cancel</Button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The assistant conversation: type, and Claude answers as it writes. Look-ups show as small steps; changes arrive as
 * cards that save only when confirmed. `page` tells it which project or task the person is looking at.
 */
export function AssistantChat({ chatId: initialId, initial = [], page, compact, onChat }: {
  chatId?: string; initial?: ChatItem[]; page?: string; compact?: boolean; onChat?: (id: string, title: string) => void
}) {
  const [chatId, setChatId] = useState(initialId)
  const [items, setItems] = useState<ChatItem[]>(initial)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [items])

  const update = (fn: (all: ChatItem[]) => ChatItem[]) => setItems((all) => fn(all))
  const send = async (message: string) => {
    const q = message.trim()
    if (!q || busy) return
    setText('')
    setBusy(true)
    update((all) => [...all, { kind: 'user', text: q }])
    try {
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, text: q, page }) })
      if (!res.ok || !res.body) throw new Error(res.status === 403 ? 'The assistant is for the Seven Billion team.' : 'The assistant did not answer. Try again.')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
          if (!line.trim()) continue
          const e = JSON.parse(line) as AssistantEvent
          if (e.t === 'chat') {
            setChatId(e.id); onChat?.(e.id, e.title)
            // the full page keeps the chat in its address, without reloading what is streaming
            if (!compact && !chatId) window.history.replaceState(null, '', `/assistant?chat=${e.id}`)
          }
          else if (e.t === 'text') update((all) => {
            const last = all.at(-1)
            return last?.kind === 'assistant' ? [...all.slice(0, -1), { ...last, text: last.text + e.d }] : [...all, { kind: 'assistant', text: e.d }]
          })
          else if (e.t === 'tool') update((all) => {
            const i = all.findIndex((x) => x.kind === 'tool' && x.id === e.id)
            const item: ChatItem = { kind: 'tool', id: e.id, title: e.title, ok: e.ok }
            return i >= 0 ? all.map((x, j) => (j === i ? item : x)) : [...all, item]
          })
          else if (e.t === 'proposal') update((all) => [...all, { kind: 'proposal', id: e.id, title: e.title, summary: e.summary, status: 'pending' }])
          else if (e.t === 'error') update((all) => [...all, { kind: 'error', text: e.message }])
        }
      }
    } catch (err) {
      update((all) => [...all, { kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' }])
    } finally {
      setBusy(false)
      area.current?.focus()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('min-h-0 flex-1 overflow-y-auto', compact ? 'px-3 py-3' : 'px-4 py-4')} aria-live="polite">
        <div className={cn('mx-auto flex flex-col gap-3', !compact && 'max-w-3xl')}>
          {!items.length ? (
            <div className="flex flex-col items-start gap-3 py-6">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Sparkles className="size-4" /></span>
              <div>
                <p className="m-0 text-[15px] font-semibold">Ask Helm</p>
                <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">Log time, create tasks and requests, move work along, or ask about anything in Helm. Changes wait for your confirmation.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => <Button key={s} size="sm" variant="outline" className="h-auto py-1.5 text-left whitespace-normal" onClick={() => void send(s)}>{s}</Button>)}
              </div>
            </div>
          ) : null}
          {items.map((it, i) => it.kind === 'user' ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-[13px] whitespace-pre-wrap text-primary-foreground">{it.text}</div>
          ) : it.kind === 'assistant' ? (
            <div key={i} className="max-w-[92%] text-[13px] leading-relaxed whitespace-pre-wrap"><Linked text={it.text} /></div>
          ) : it.kind === 'tool' ? (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {it.ok === undefined ? <Loader className="size-3 animate-spin" /> : it.ok ? <Check className="size-3 text-good" /> : <X className="size-3 text-crit" />}
              {it.title}
            </div>
          ) : it.kind === 'proposal' ? (
            <Proposal key={it.id} item={it} onChange={(next) => update((all) => all.map((x) => (x.kind === 'proposal' && x.id === it.id ? { ...x, ...next } : x)))} />
          ) : (
            <p key={i} role="alert" className="m-0 rounded-md bg-crit-bg px-3 py-2 text-xs text-crit-ink">{it.text}</p>
          ))}
          {busy && items.at(-1)?.kind !== 'assistant' ? <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader className="size-3 animate-spin" />Thinking…</div> : null}
          <div ref={end} />
        </div>
      </div>
      <form className={cn('border-t border-border/60 bg-card', compact ? 'p-2' : 'p-3')} onSubmit={(e) => { e.preventDefault(); void send(text) }}>
        <div className={cn('relative mx-auto', !compact && 'max-w-3xl')}>
          <Textarea ref={area} value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 2 : 3} aria-label="Message the assistant"
            placeholder="e.g. Log 2h on Data mapping yesterday, and move REQ-1061 to estimated"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text) } }}
            className="min-h-0 resize-none pr-11" />
          <Button type="submit" size="icon-sm" aria-label="Send" disabled={busy || !text.trim()} className="absolute right-2 bottom-2"><ArrowUp /></Button>
        </div>
        <p className="m-0 mx-auto mt-1 max-w-3xl text-[11px] text-muted-foreground">Enter to send, Shift+Enter for a new line. The assistant can make mistakes: check each change before you confirm it.</p>
      </form>
    </div>
  )
}
