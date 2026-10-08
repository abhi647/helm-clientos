'use client'

import { startTransition, useActionState, useRef, useState, useTransition } from 'react'
import { Lock, Users } from 'lucide-react'
import type { ActionResult } from '@/app/_actions/shared'
import { MentionTextarea, type Person } from '@/components/mention-textarea'
import { cn } from '@/components/ui'

type FormAction = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>

function Message({ state }: { state: ActionResult | null }) {
  if (!state) return null
  return state.ok
    ? state.message ? <p role="status" className="m-0 text-xs font-medium text-good-ink">{state.message}</p> : null
    : <p role="alert" className="m-0 text-xs text-crit-ink">{state.error}</p>
}

/**
 * A guard against acting on unsaved input. 'typed' (default): fields matching `selector` still hold text, e.g. a line
 * typed into "Add a line" but not added. 'changed': fields differ from what was last saved, e.g. a new currency picked
 * but "Save details" not pressed.
 */
export type UnsavedGuard = { selector: string; message: string; mode?: 'typed' | 'changed' }
const changed = (el: Element) => el instanceof HTMLSelectElement
  ? Array.from(el.options).some((o) => o.selected !== o.defaultSelected)
  : (el as HTMLInputElement).value !== (el as HTMLInputElement).defaultValue
function stoppedBy(guards?: UnsavedGuard | UnsavedGuard[]) {
  for (const guard of [guards ?? []].flat()) {
    const els = Array.from(document.querySelectorAll<HTMLInputElement>(guard.selector))
    const unsaved = guard.mode === 'changed' ? els.some(changed) : els.some((el) => el.value.trim() !== '')
    if (unsaved) {
      window.alert(guard.message)
      return true
    }
  }
  return false
}

/** A form bound to a server action, with pending state and an inline result message. */
/**
 * Submits a form to its action without React's automatic reset. With action={run}, React clears every field once
 * the action finishes, even when it failed, so the person lost what they typed along with seeing the error.
 * Forms here reset themselves only on success.
 */
export function keepOnError(run: (data: FormData) => void, stop?: () => boolean) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (stop?.()) return
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
    startTransition(() => run(data))
  }
}

export function ActionForm({ action, children, submit, className, resetOnSuccess = true, primary = true, guard }: {
  action: FormAction; children?: React.ReactNode; submit: string; className?: string; resetOnSuccess?: boolean; primary?: boolean; guard?: UnsavedGuard | UnsavedGuard[]
}) {
  const ref = useRef<HTMLFormElement>(null)
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(async (prev, form) => {
    const res = await action(prev, form)
    if (res.ok && resetOnSuccess) ref.current?.reset()
    return res
  }, null)
  return (
    <form ref={ref} onSubmit={keepOnError(run, () => stoppedBy(guard))} className={cn('flex flex-col gap-2', className)}>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={cn('btn', primary && 'btn-primary')}>{pending ? 'Saving…' : submit}</button>
        <Message state={state} />
      </div>
    </form>
  )
}

/** Comment box. Staff choose Internal (default) or Shared; customers always post Shared. */
export function CommentBox({ action, entityType, entityId, customerId, staff, defaultShared = false, people = [] }: {
  action: FormAction; entityType: string; entityId: string; customerId: string; staff: boolean; defaultShared?: boolean; people?: Person[]
}) {
  const [vis, setVis] = useState<'internal' | 'shared'>(defaultShared ? 'shared' : 'internal')
  const ref = useRef<HTMLFormElement>(null)
  const box = useRef<{ clear: (sent?: string) => void }>(null)
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(async (prev, form) => {
    const res = await action(prev, form)
    if (res.ok) box.current?.clear(String(form.get('body') ?? ''))
    return res
  }, null)
  // internal comments can only mention Seven Billion people
  const mentionable = staff && vis === 'internal' ? people.filter((p) => !p.customer) : people
  const id = `reply-${entityId}`
  return (
    <form ref={ref} onSubmit={keepOnError(run)} className="flex flex-col gap-2">
      <input type="hidden" name="entity_type" value={entityType} />
      <input type="hidden" name="entity_id" value={entityId} />
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="visibility" value={staff ? vis : 'shared'} />
      <label htmlFor={id} className="label">Reply</label>
      <MentionTextarea ref={box} id={id} name="body" required people={mentionable}
        placeholder={staff && vis === 'internal' ? 'Internal note for the Seven Billion team… (@ to mention)' : 'Write a reply… (@ to mention)'}
        className={cn(staff && vis === 'internal' && 'border-dashed border-internal-line bg-[#f7f8f9]')} />
      <div className="flex flex-wrap items-center gap-2">
        {staff ? (
          <span role="radiogroup" aria-label="Who can see this comment" className="inline-flex h-7 overflow-hidden rounded-md border border-[#d5dcdf]">
            {(['internal', 'shared'] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={vis === v} onClick={() => setVis(v)}
                className={cn('inline-flex cursor-pointer items-center gap-1 border-0 px-2.5 text-xs font-semibold',
                  vis === v ? (v === 'internal' ? 'bg-internal-bg text-internal-ink' : 'bg-shared-bg text-link') : 'bg-white text-muted')}>
                {v === 'internal' ? <Lock className="size-3" aria-hidden /> : <Users className="size-3" aria-hidden />}
                {v === 'internal' ? 'Internal' : 'Shared with customer'}
              </button>
            ))}
          </span>
        ) : null}
        <span className="text-xs text-muted">
          {staff ? (vis === 'internal' ? 'Only Seven Billion will see this.' : 'The customer will see this and be notified.') : 'Seven Billion will be notified.'}
        </span>
        <button type="submit" disabled={pending} className="btn ml-auto">{pending ? 'Posting…' : 'Post'}</button>
      </div>
      <Message state={state} />
    </form>
  )
}

/** Runs a server action from a button (no form fields), showing a pending state and the result. */
export function ActionButton({ run, children, primary, className, confirm, guard }: {
  run: () => Promise<ActionResult>; children: React.ReactNode; primary?: boolean; className?: string; confirm?: string; guard?: UnsavedGuard | UnsavedGuard[]
}) {
  const [pending, start] = useTransition()
  const [state, setState] = useState<ActionResult | null>(null)
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} className={cn('btn', primary && 'btn-primary', className)}
        onClick={() => {
          if (stoppedBy(guard)) return
          if (confirm && !window.confirm(confirm)) return
          start(async () => setState(await run()))
        }}>
        {pending ? 'Working…' : children}
      </button>
      <Message state={state} />
    </span>
  )
}

/** Inline status select for a task row. */
export function StatusSelect<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => Promise<ActionResult>; label: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex items-center gap-1">
      <select aria-label={label} disabled={pending} defaultValue={value} className="input h-7 py-0 text-xs"
        onChange={(e) => start(async () => {
          const res = await onChange(e.target.value as T)
          setError(res.ok ? null : res.error)
        })}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error ? <span role="alert" className="text-xs text-crit-ink">{error}</span> : null}
    </span>
  )
}

/** Approve / request changes, used by the customer approver. */
export function DecisionForm({ action, approvalId, idName = 'approval_id' }: { action: FormAction; approvalId: string; idName?: string }) {
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(action, null)
  return (
    <form onSubmit={keepOnError(run)} className="flex flex-col gap-2">
      <input type="hidden" name={idName} value={approvalId} />
      <label htmlFor={`c-${approvalId}`} className="label">Comment (needed to request changes)</label>
      <textarea id={`c-${approvalId}`} name="comment" rows={2} className="textarea" placeholder="Optional for approval" />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="approved" disabled={pending} className="btn btn-primary">Approve</button>
        <button type="submit" name="decision" value="changes_requested" disabled={pending} className="btn">Request changes</button>
      </div>
      <Message state={state} />
    </form>
  )
}

/**
 * "Approve for the customer": Seven Billion confirms something the customer agreed outside Helm (the contract, a call,
 * an email). Folded away so it is a deliberate step; the note is kept on the record and sent to the customer.
 */
export function ApproveForCustomer({ action, idName, id, label = 'Approve for the customer', hint, guard }: {
  action: FormAction; idName: string; id: string; label?: string; hint?: string; guard?: UnsavedGuard | UnsavedGuard[]
}) {
  return (
    <details className="rounded-md border border-line-soft bg-head/40 p-2.5">
      <summary className="cursor-pointer list-none text-xs font-semibold text-link">✓ {label}</summary>
      <ActionForm action={action} submit={label} className="mt-2" resetOnSuccess={false} guard={guard}>
        <input type="hidden" name={idName} value={id} />
        <input name="note" maxLength={500} aria-label="How the customer agreed" placeholder="How they agreed, e.g. signed contract, call on 7 Oct (optional)" className="input" />
        <p className="m-0 text-xs text-muted">{hint ?? 'The customer is told by email and it shows as approved by you for them.'}</p>
      </ActionForm>
    </details>
  )
}

/** A select that saves its form as soon as it changes (e.g. a rate card's currency), so the choice is never lost. */
export function AutoSaveSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
}
