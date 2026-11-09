import { z } from 'zod'
import { runTurn } from '@/lib/assistant/agent'
import { getProfile } from '@/lib/session'

export const runtime = 'nodejs'
export const maxDuration = 300

const body = z.object({
  chatId: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(8000),
  page: z.string().max(300).optional(),
})

/** One assistant turn, streamed as newline-delimited JSON events (text as it is written, tool steps, proposals). */
export async function POST(req: Request) {
  const me = await getProfile()
  if (!me || me.kind !== 'internal') return new Response('Not allowed', { status: 403 })
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new Response('Bad request', { status: 400 })
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of runTurn(parsed.data)) controller.enqueue(enc.encode(`${JSON.stringify(event)}\n`))
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
}
