import type { Instrumentation } from 'next'

// Unhandled errors in pages, server actions and API routes are recorded for Admin → System health.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { logError } = await import('@/lib/system-log')
  const e = err as Error & { digest?: string; code?: string }
  // someone navigated away while the page was still loading: not a fault
  if (/stream closed early|aborted|ECONNRESET/i.test(e.message ?? '') || e.code === 'ECONNRESET') return
  await logError('request', e, { path: request.path, method: request.method, route: context.routePath, kind: context.routeType, digest: e.digest ?? null })
}
