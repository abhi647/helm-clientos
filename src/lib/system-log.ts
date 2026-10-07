import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/database.types'

const text = (err: unknown) => (err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)).slice(0, 2000)

/** Records a server problem for Admin → System health. Never throws: logging must not break the request. */
export async function logError(source: string, err: unknown, detail: Record<string, Json | undefined> = {}, level: 'error' | 'warn' | 'info' = 'error') {
  if (level === 'info') console.info(`[${source}]`, text(err))
  else console.error(`[${source}]`, err)
  try {
    await createAdminClient().from('system_log').insert({ source, level, message: text(err), detail: detail as { [key: string]: Json } })
  } catch {
    // the database itself may be the problem; the console line above is the fallback
  }
}

/** Runs a background job and records when it started, finished and whether it worked. */
export async function recordJob<T extends Record<string, unknown>>(job: string, run: () => Promise<T>): Promise<T> {
  const db = createAdminClient()
  const started = new Date().toISOString()
  await db.from('job_runs').upsert({ job, last_started_at: started }, { onConflict: 'job' }).then(() => undefined, () => undefined)
  try {
    const result = await run()
    const now = new Date().toISOString()
    await db.from('job_runs').update({ last_finished_at: now, last_ok_at: now, last_error: null, last_result: result as unknown as { [key: string]: Json } }).eq('job', job)
    return result
  } catch (err) {
    await db.from('job_runs').update({ last_finished_at: new Date().toISOString(), last_error: text(err) }).eq('job', job)
    await logError(`job:${job}`, err)
    throw err
  }
}

/** Old log lines are removed after 90 days. */
export async function pruneSystemLog() {
  await createAdminClient().from('system_log').delete().lt('at', new Date(Date.now() - 90 * 86_400_000).toISOString())
}
