import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { helm, type Helm } from '@/lib/mcp/context'
import { helmTools, runHelmTool, type HelmTool } from '@/lib/mcp/tools'
import { createClient } from '@/lib/supabase/server'

/**
 * Helm's in-app assistant. Claude reads with the same tools as the Helm connector, as the signed-in person (Row Level
 * Security decides what it sees). Tools that change data never run here: they become proposals the person confirms
 * with a button, and only then run, as them.
 */

export const MODEL = 'claude-opus-5-5'
const MAX_STEPS = 10
const MAX_RESULT = 30_000

type Param = Anthropic.Beta.Messages.BetaMessageParam
export type AssistantEvent =
  | { t: 'chat'; id: string; title: string }
  | { t: 'text'; d: string }
  | { t: 'tool'; id: string; name: string; title: string; ok?: boolean }
  | { t: 'proposal'; id: string; tool: string; title: string; summary: string }
  | { t: 'done' }
  | { t: 'error'; message: string }

// Frozen: no dates, names or ids here, so the system prompt and tool list stay cached across every turn and person.
const SYSTEM = `You are the assistant inside Helm, Seven Billion Analytics' client delivery workspace. The person talking to you is on the Seven Billion delivery team (PM, consultant, finance or leadership). You help them get work into Helm and find things in it: log time, create and update tasks, raise requests for customers, move requests along, comment, and answer questions about projects, tasks, requests, people and approvals.

How to work:
- Look things up before you change them. Use list_projects, search, list_tasks, my_work and the other read tools to find the right project, task, request or person and its id. Never invent an id; if two things match, ask which one.
- Tools that change data (create, update, log, move, comment) do not save anything when you call them. Each call becomes a proposal card the person confirms or cancels with a button. After proposing, say in one short sentence what will be saved, then stop and let them confirm. You will be told later which proposals were confirmed or cancelled.
- When one message asks for several changes, propose each of them; the person can confirm them one by one.
- Fill in sensible defaults the person would expect (for example today's date for time logged today) and mention them; ask only when something important is missing or ambiguous.
- Each message starts with today's date and the page the person is on, when they are on a project or task. Use that as the default project or task.
- Keep replies short and plain: a sentence or two, or a short list. Use the person's own words for things. Give links from tool results when they help.
- You can only do what the tools allow. You cannot delete anything, approve on a customer's behalf, bill, or change settings; say so and point to where in Helm it is done.
- Stay on Helm work. For anything else, say briefly that you are here for Helm.`

const client = () => new Anthropic()

/** The person behind this request, acting through their own session (so Row Level Security applies). */
export async function sessionHelm(): Promise<Helm> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return helm(token ? { token, clientId: 'helm-app', scopes: [] } : undefined)
}

const schemaOf = (input: z.ZodObject): Anthropic.Beta.Messages.BetaTool['input_schema'] => {
  const schema = { ...(z.toJSONSchema(input, { io: 'input' }) as Record<string, unknown>) }
  delete schema.$schema
  return { ...schema, type: 'object' } as Anthropic.Beta.Messages.BetaTool['input_schema']
}

let toolCache: Anthropic.Beta.Messages.BetaTool[] | null = null
const toolList = () => (toolCache ??= helmTools().map((t) => ({
  name: t.name,
  description: t.write ? `${t.description}\n\nProposes the change for the person to confirm; nothing is saved until they do.` : t.description,
  input_schema: schemaOf(t.input),
})))

/** A plain-words line for a proposal card, from the tool's title and the values it was given. */
export function summarise(tool: HelmTool, input: Record<string, unknown>): string {
  const skip = new Set(['project_id', 'task_id', 'request_id', 'parent_task_id', 'phase_id', 'assignee_id', 'owner_id', 'entity_id', 'billing_line_id'])
  const parts = Object.entries(input).filter(([k, v]) => !skip.has(k) && v != null && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? 'yes' : 'no') : JSON.stringify(v)}`)
  return `${tool.title}${parts.length ? ` · ${parts.join(' · ')}` : ''}`.slice(0, 480)
}

const today = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
const iso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

/**
 * One turn: adds the person's message, then lets Claude read and propose until it is done, streaming as it goes.
 * The stored conversation only ever grows (append-only), which keeps the prompt cache and thinking blocks valid.
 */
export async function* runTurn({ chatId, text, page }: { chatId?: string; text: string; page?: string }): AsyncGenerator<AssistantEvent> {
  const supabase = await createClient()
  const h = await sessionHelm()
  if (!h.staff) { yield { t: 'error', message: 'The assistant is for the Seven Billion team.' }; return }
  if (!process.env.ANTHROPIC_API_KEY) { yield { t: 'error', message: 'The assistant is not set up yet: add ANTHROPIC_API_KEY to the environment.' }; return }

  // the chat: an existing one of theirs, or a new one titled by this first message
  let chat: { id: string; title: string; messages: Param[]; notes: string[] }
  if (chatId) {
    const { data } = await supabase.from('ai_chats').select('id, title, messages, notes').eq('id', chatId).maybeSingle()
    if (!data) { yield { t: 'error', message: 'That chat was not found.' }; return }
    chat = { id: data.id, title: data.title, messages: data.messages as unknown as Param[], notes: (data.notes as string[]) ?? [] }
  } else {
    const title = text.replace(/\s+/g, ' ').trim().slice(0, 80) || 'New chat'
    const { data, error } = await supabase.from('ai_chats').insert({ title }).select('id, title').single()
    if (error || !data) { yield { t: 'error', message: 'Could not start a chat.' }; return }
    chat = { id: data.id, title: data.title, messages: [], notes: [] }
  }
  yield { t: 'chat', id: chat.id, title: chat.title }

  // today's date, the page and any confirmations go in the message, never in the cached system prompt
  const context = [`Today is ${today()} (${iso()}).`, page ? `The person is on ${page}.` : null,
    ...chat.notes.map((n) => `Since your last reply: ${n}`)].filter(Boolean).join('\n')
  const messages: Param[] = [...chat.messages]
  const blocks: Anthropic.Beta.Messages.BetaTextBlockParam[] = [{ type: 'text', text: context }, { type: 'text', text }]
  const last = messages.at(-1)
  // a turn that stopped early (error, step limit) ends on our tool results: add to that message instead of a second one
  if (last?.role === 'user' && Array.isArray(last.content)) last.content.push(...blocks)
  else messages.push({ role: 'user', content: blocks })
  const save = async () => {
    await supabase.from('ai_chats').update({ messages: messages as never, notes: [], updated_at: new Date().toISOString() }).eq('id', chat.id)
  }
  await save()

  const tools = toolList()
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const stream = client().beta.messages.stream({
        model: MODEL,
        max_tokens: 16_000,
        output_config: { effort: 'medium' },
        system: SYSTEM,
        tools,
        messages,
        cache_control: { type: 'ephemeral' },
        // if a safety check declines, the API retries on a suitable model within the same call
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield { t: 'text', d: event.delta.text }
      }
      const message = await stream.finalMessage()
      messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] })
      await save()

      if (message.stop_reason === 'refusal') { yield { t: 'text', d: '\n\nI can’t help with that one.' }; break }
      if (message.stop_reason === 'pause_turn') continue
      const calls = message.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use')
      if (!calls.length || message.stop_reason === 'end_turn') break
      if (message.stop_reason === 'max_tokens') { yield { t: 'error', message: 'The reply was cut off. Try asking for less at once.' }; break }

      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = []
      for (const call of calls) {
        const def = helmTools().find((d) => d.name === call.name)
        if (!def) { results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `There is no tool called ${call.name}.` }); continue }
        const parsed = def.input.safeParse(call.input ?? {})
        if (!parsed.success) {
          results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}` })
          continue
        }
        if (def.write) {
          // a change: store it as a proposal for the person to confirm; nothing runs yet
          const summary = summarise(def, parsed.data as Record<string, unknown>)
          const { data: p, error } = await supabase.from('ai_proposals').insert({ chat_id: chat.id, tool: def.name, input: parsed.data as never, summary }).select('id').single()
          if (error || !p) { results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: 'Could not record the proposal.' }); continue }
          yield { t: 'proposal', id: p.id, tool: def.name, title: def.title, summary }
          results.push({ type: 'tool_result', tool_use_id: call.id, content: `Proposed to the person as card ${p.id}: "${summary}". Nothing is saved until they press Confirm.` })
        } else {
          yield { t: 'tool', id: call.id, name: def.name, title: def.title }
          const res = await runHelmTool(h, def.name, parsed.data)
          yield { t: 'tool', id: call.id, name: def.name, title: def.title, ok: res.ok }
          const body = res.ok ? (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)) : res.error
          results.push({ type: 'tool_result', tool_use_id: call.id, is_error: !res.ok, content: body.length > MAX_RESULT ? `${body.slice(0, MAX_RESULT)}\n…(cut: ask for something narrower)` : body })
        }
      }
      // every result for this turn goes back in one message
      messages.push({ role: 'user', content: results })
      await save()
    }
    yield { t: 'done' }
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) yield { t: 'error', message: 'The assistant is busy. Try again in a minute.' }
    else if (err instanceof Anthropic.AuthenticationError) yield { t: 'error', message: 'The assistant’s API key is not valid. Check ANTHROPIC_API_KEY.' }
    else if (err instanceof Anthropic.APIError) yield { t: 'error', message: `The assistant could not answer (${err.status ?? 'error'}). Try again.` }
    else yield { t: 'error', message: 'Something went wrong. Try again.' }
  }
}

type Stored = { role: 'user' | 'assistant'; content: string | { type: string; text?: string; name?: string; id?: string; tool_use_id?: string; content?: unknown; is_error?: boolean }[] }
type ProposalRow = { id: string; tool: string; summary: string; status: string; error: string | null; result: unknown }

/** A saved conversation as the chat shows it: the person's words, the replies, look-ups and change cards. */
export function chatItems(messages: unknown, proposals: ProposalRow[]) {
  const titleOf = new Map(helmTools().map((t) => [t.name, t.title]))
  const byId = new Map(proposals.map((p) => [p.id, p]))
  const items: import('@/components/assistant/chat').ChatItem[] = []
  for (const m of (messages as Stored[]) ?? []) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
    if (m.role === 'user') {
      // the first text block of each typed message is the date and page context, not what the person wrote
      const texts = blocks.filter((b) => b.type === 'text' && b.text)
      for (const b of texts.slice(texts.length > 1 ? 1 : 0)) if (!b.text!.startsWith('Today is ')) items.push({ kind: 'user', text: b.text! })
      for (const b of blocks) {
        if (b.type !== 'tool_result') continue
        const body = typeof b.content === 'string' ? b.content : ''
        const card = /as card ([0-9a-f-]{36})/.exec(body)?.[1]
        const p = card ? byId.get(card) : undefined
        if (p) {
          const link = p.result && typeof p.result === 'object' && 'link' in p.result ? String((p.result as { link: unknown }).link) : undefined
          items.push({ kind: 'proposal', id: p.id, title: titleOf.get(p.tool) ?? p.tool, summary: p.summary, status: p.status as 'pending', note: p.error ?? undefined, link })
        }
      }
    } else {
      for (const b of blocks) {
        if (b.type === 'text' && b.text) items.push({ kind: 'assistant', text: b.text })
        else if (b.type === 'tool_use' && b.name && !helmTools().find((t) => t.name === b.name)?.write) items.push({ kind: 'tool', id: b.id ?? '', title: titleOf.get(b.name) ?? b.name, ok: true })
      }
    }
  }
  return items
}
