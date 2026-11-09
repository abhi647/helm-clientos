'use server'

import { sessionHelm } from '@/lib/assistant/agent'
import { runHelmTool } from '@/lib/mcp/tools'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, dbFail, done, fail, ok, uuid } from './shared'

const short = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 600 ? `${s.slice(0, 600)}…` : s
}

/** Adds a line the assistant reads with the person's next message (what was confirmed, cancelled or failed). */
async function note(chatId: string, line: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('ai_chats').select('notes').eq('id', chatId).maybeSingle()
  await supabase.from('ai_chats').update({ notes: [...((data?.notes as string[]) ?? []), line] as never, updated_at: new Date().toISOString() }).eq('id', chatId)
}

/** The person confirms a proposed change: it runs now, as them, under the same rules as the app. */
export async function confirmProposal(id: string): Promise<ActionResult & { link?: string }> {
  await requireStaff()
  if (!uuid.safeParse(id).success) return fail('Unknown change.')
  const supabase = await createClient()
  // claim it first, so a double click never saves twice
  const { data: p, error } = await supabase.from('ai_proposals').update({ status: 'confirmed', decided_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').select('id, chat_id, tool, input, summary').maybeSingle()
  if (error) return dbFail(error)
  if (!p) return fail('This change was already confirmed or cancelled.')
  const res = await runHelmTool(sessionHelm, p.tool, p.input)
  if (!res.ok) {
    await supabase.from('ai_proposals').update({ status: 'failed', error: res.error }).eq('id', p.id)
    await note(p.chat_id, `the change "${p.summary}" was confirmed but Helm refused it: ${res.error}`)
    return fail(res.error)
  }
  await supabase.from('ai_proposals').update({ result: res.data as never }).eq('id', p.id)
  await note(p.chat_id, `the person confirmed "${p.summary}" and it was saved. Result: ${short(res.data)}`)
  const link = typeof res.data === 'object' && res.data && 'link' in res.data ? String((res.data as { link: unknown }).link) : undefined
  return { ...done('Saved.'), link }
}

/** The person cancels a proposed change: nothing is saved, and the assistant is told. */
export async function cancelProposal(id: string): Promise<ActionResult> {
  await requireStaff()
  if (!uuid.safeParse(id).success) return fail('Unknown change.')
  const supabase = await createClient()
  const { data: p, error } = await supabase.from('ai_proposals').update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').select('chat_id, summary').maybeSingle()
  if (error) return dbFail(error)
  if (!p) return fail('This change was already confirmed or cancelled.')
  await note(p.chat_id, `the person cancelled "${p.summary}"; nothing was saved`)
  return ok('Cancelled.')
}
